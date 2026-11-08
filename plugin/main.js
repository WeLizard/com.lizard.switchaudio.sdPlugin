'use strict';
const {execFile, spawn} = require('node:child_process');
const path = require('node:path');
const S = require('./settings');
const Icons = require('./icons');
const State = require('./device-state');
const {createTelemetry} = require('./telemetry');
const PREFIX = 'com.lizard.switchaudio.';
const helperPath = path.join(__dirname, 'AudioSwitch.exe');

function nativeHelper(args) {
    return new Promise((resolve, reject) => {
        execFile(helperPath, args.map(String), {encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024}, (error, stdout) => {
            if (error && error.code === 'ENOENT')
                return reject(new Error('AudioSwitch.exe not found. Reinstall the plugin or check your antivirus quarantine.'));
            let result;
            try { result = JSON.parse((stdout || '').replace(/^\uFEFF/, '').trim()); }
            catch { return reject(new Error(error ? `Audio helper failed: ${error.code || error.message}` : 'Invalid response from AudioSwitch.exe')); }
            if (!result || typeof result !== 'object') return reject(new Error('Invalid audio helper result'));
            if (error || result.success === false || result.error) return reject(new Error(result.error || error?.message || 'Audio command failed'));
            resolve(result);
        });
    });
}

function launchUri(uri) {
    return new Promise((resolve, reject) => {
        if (!/^[A-Za-z0-9._!:\\-]+$/.test(uri)) return reject(new Error('Invalid application identifier.'));
        execFile('cmd.exe', ['/d', '/s', '/c', `start "" "${uri}"`], {windowsHide: true, timeout: 10000}, error => {
            if (error) reject(new Error('Could not launch the application.')); else resolve();
        });
    });
}

function createController({helper = nativeHelper, send, image, log = () => {}, now = () => performance.now(),
    delay = ms => new Promise(r => setTimeout(r, ms)), launch = launchUri, telemetry = null} = {}) {
    const monitor = telemetry || createTelemetry({helper, now, log});
    const contexts = new Map(), held = new Map(), rendered = new Map(), releases = new Set(), pending = new Set(), work = new Set();
    const queues = {audio: Promise.resolve(), ptt: Promise.resolve(), media: Promise.resolve()};
    let stopped = false, epoch = 0, lastMediaSource = null;
    const emit = (event, context, payload, action) => send({event, context, ...(payload === undefined ? {} : {payload}), ...(action ? {action} : {})});
    function fail(context, error, action) {
        const message = error instanceof Error ? error.message : String(error);
        log(message);
        if (context && contexts.has(context)) {
            emit('showAlert', context);
            emit('sendToPropertyInspector', context, {error: message}, action || contexts.get(context)?.action);
        }
    }
    function track(task, context, action) {
        const safe = Promise.resolve(task).catch(e => fail(context, e, action));
        work.add(safe); safe.finally(() => work.delete(safe)); return safe;
    }
    function enqueue(lane, fn, context, action) {
        const task = queues[lane].then(fn);
        queues[lane] = track(task, context, action); return queues[lane];
    }
    function paint(context, icon, state = 0, title, position = null, appearance = null) {
        const signature = JSON.stringify([icon, state, title, position, appearance]);
        if (rendered.get(context) === signature) return;
        const uri = image(icon, position, appearance);
        emit('setState', context, {state});
        emit('setImage', context, {image: uri, target: 0});
        if (title !== undefined) emit('setTitle', context, {title, target: 0});
        rendered.set(context, signature);
    }
    function model(settings, sample = monitor.getSample(), isPending = false) {
        const active = State.defaultId(sample, settings.deviceType, settings.roles, now());
        const index = settings.mode === 'selected' ? (settings.devices.length ? 0 : -1) : settings.devices.findIndex(d => d.id === active);
        const device = settings.devices[index];
        let indicator = State.classify(sample, settings.deviceType, settings.roles, device?.id, now());
        if (settings.mode === 'cycle' && settings.devices.length && !device) {
            indicator = {...indicator, status: State.fresh(sample, now()) && active ? 'inactive' : 'unknown', reason: active ? 'outside_list' : 'no_current_device'};
        }
        let status = indicator.status;
        if ((settings.mode === 'cycle' || !settings.highlightActive) && (status === 'active' || status === 'partial')) status = 'inactive';
        return {icon: device ? Icons.assetFor(device.icon, settings.deviceType) : 'device_unknown',
            position: S.badgeFor(settings, index), appearance: {status, pending: isPending}, indicator, device, sample};
    }
    function render(context, record) {
        const s = record.settings, action = record.action.slice(PREFIX.length), sample = monitor.getSample();
        if (action === 'toggle') {
            const view = model(s, sample, pending.has(context));
            paint(context, view.icon, 0, '', view.position, view.appearance);
        } else if (action === 'mute') {
            const control = State.fresh(sample, now()) ? sample.data.controls?.[s.muteType === 'microphone' ? 'input' : 'output'] : null;
            const prefix = s.muteType === 'microphone' ? 'mic_' : 'dev_';
            // Unknown mute is not asserted as "muted" or "unmuted" in the SDK state.
            paint(context, prefix + (control?.muted ? 'mute' : 'unmute'), control?.muted ? 1 : 0);
        } else if (action === 'pushtotalk') {
            const talking = held.has(context) && !releases.has(context);
            paint(context, talking ? 'ptt_on' : 'ptt_off', talking ? 1 : 0);
        } else if (action === 'setvolume') {
            const volume = S.number(s.targetVolume, 50, 0, 100);
            paint(context, 'volume_' + (volume === 0 ? 0 : Math.ceil(volume / 25) * 25));
        } else if (action === 'playpause') {
            const media = State.mediaSession(sample, now());
            paint(context, 'play', 0, media ? (media.title || media.artist || '') : '');
        }
    }
    function renderAll() { for (const [context, record] of contexts) if (record.visible) render(context, record); }
    monitor.subscribe(() => {
        if (!stopped) {
            const media = State.mediaSession(monitor.getSample(), now());
            if (media && media.source) lastMediaSource = media.source;
            renderAll();
        }
    });
    async function refresh() { const sample = await monitor.refresh(); renderAll(); return sample; }
    async function release(context) {
        const id = held.get(context);
        if (!id) { releases.delete(context); return; }
        releases.add(context);
        if (![...held].some(([key, other]) => key !== context && other === id && !releases.has(key))) await helper(['mute', 'input', '1', id]);
        held.delete(context); releases.delete(context); renderAll();
    }
    async function cleanup() {
        for (const context of [...held.keys()]) { try { await release(context); } catch (e) { fail(context, e); } }
    }
    function command(context, record) {
        const s = record.settings, action = record.action.slice(PREFIX.length), commandEpoch = epoch;
        const revision = record.revision;
        const current = () => !stopped && commandEpoch === epoch && contexts.get(context) === record && record.revision === revision;
        const lane = action === 'pushtotalk' || (action === 'mute' && s.muteType === 'microphone') ? 'ptt'
            : ['playpause', 'medianext', 'mediaprev', 'soundsettings'].includes(action) ? 'media' : 'audio';
        return enqueue(lane, async () => {
            if (!current()) return;
            if (action === 'toggle') {
                pending.add(context); renderAll();
                try {
                    const sample = await refresh();
                    if (!current()) return;
                    const available = State.availableDevices(sample, s.deviceType, now(), s.roles);
                    const target = S.chooseTarget(s, available);
                    // No-op only after a fresh read, never based on the last picture.
                    if (State.classify(sample, s.deviceType, s.roles, target.id, now()).status !== 'active')
                        await helper(['set', target.id, s.deviceType, s.roles]);
                } finally {
                    pending.delete(context);
                    // Read even after an exception: partial role changes/rollback can have occurred.
                    if (commandEpoch === epoch && !stopped) await refresh();
                }
                return;
            }
            switch (action) {
                case 'mute': await helper(['mute', s.muteType === 'microphone' ? 'input' : 'output', 'toggle']); break;
                case 'volumeup': case 'volumedown':
                    await helper(['volume', 'output', 'change', String(S.volumeStep(s) * (action === 'volumeup' ? 1 : -1))]); break;
                case 'setvolume': await helper(['volume', 'output', 'set', String(S.number(s.targetVolume, 50, 0, 100))]); break;
                case 'appvolumeup': case 'appvolumedown':
                    await helper(['appvolume', S.text(s.processName, 260) || 'focused', String(S.number(s.appVolumeStep, .1, .01, 1) * (action === 'appvolumeup' ? 1 : -1))]); break;
                case 'pushtotalk': {
                    if (held.has(context)) return;
                    const status = await helper(['status', 'input']);
                    if (!current()) return;
                    held.set(context, status.id);
                    try { await helper(['mute', 'input', '0', status.id]); }
                    catch (e) { await release(context).catch(error => fail(context, error)); throw e; }
                    // Remute immediately if the host/page vanished during the native command.
                    if (!current()) await release(context);
                    renderAll(); return; // Do not hold the PTT lane waiting for telemetry.
                }
                case 'playpause': {
                    try { await helper(['media', 'playpause']); }
                    catch (e) {
                        if (!current()) return;
                        if (/Nothing is playing/i.test(e.message) && lastMediaSource) {
                            await launch('shell:AppsFolder\\' + lastMediaSource);
                            await delay(2000);
                            if (current()) await helper(['media', 'playpause']);
                        } else throw e;
                    }
                    break;
                }
                case 'medianext': await helper(['media', 'next']); break;
                case 'mediaprev': await helper(['media', 'previous']); break;
                case 'soundsettings': await launch('ms-settings:sound'); break;
                default: return;
            }
            // Status updates run independently of the PTT/media command lane.
            if (commandEpoch === epoch && !stopped) track(refresh(), context, record.action);
        }, context, record.action);
    }
    function remove(context) {
        contexts.delete(context); rendered.delete(context); pending.delete(context);
        return enqueue('ptt', () => release(context), context);
    }
    function handle(data) {
        if (!data || typeof data !== 'object') return;
        const {event, context, action, device} = data, payload = data.payload || {};
        if (event === 'deviceDidDisconnect') return Promise.all([...contexts].filter(([, r]) => r.device === device).map(([key]) => remove(key)));
        if (event === 'willDisappear') return remove(context);
        if (event === 'sendToPlugin' && payload.requestDevices) return (async () => {
            const deviceType = payload.deviceType === 'input' ? 'input' : 'output';
            try { const devices = await helper(['list', deviceType]); emit('sendToPropertyInspector', context, {devices, deviceType, requestId: payload.requestId}, action); }
            catch (e) { emit('sendToPropertyInspector', context, {error: e.message, deviceType, requestId: payload.requestId}, action); }
        })();
        if (event === 'sendToPlugin' && payload.requestMedia) {
            const sample = monitor.getSample();
            const media = State.fresh(sample, now()) ? sample.data.media : {available: false, session: null};
            emit('sendToPropertyInspector', context, {media}, action);
            return;
        }
        if (event === 'sendToPlugin' && payload.requestIndicator) {
            const settings = S.normalize(payload.settings || contexts.get(context)?.settings || {});
            const v = model(settings);
            emit('sendToPropertyInspector', context, {indicator: v.indicator, indicatorRequestId: payload.indicatorRequestId,
                indicatorImage: image(v.icon, v.position, v.appearance),
                ageMs: v.sample ? Math.max(0, Math.round(now() - v.sample.at)) : null,
                endpointName: v.device?.label || v.device?.name || '', monitoring: monitor.info?.() || {}}, action);
            return;
        }
        if (!context || !(action || contexts.get(context)?.action || '').startsWith(PREFIX)) return;
        if (event === 'willAppear' || event === 'didReceiveSettings' || !contexts.has(context)) {
            let record = contexts.get(context);
            if (!record) { record = {revision: 0, visible: false}; contexts.set(context, record); }
            record.revision++; record.action = action || record.action;
            record.settings = S.normalize(payload.settings || record.settings || {});
            record.device = device || record.device;
            record.visible = event === 'willAppear' || record.visible;
        }
        const record = contexts.get(context);
        if (event === 'keyDown') return command(context, record);
        if (event === 'keyUp' && record.action === PREFIX + 'pushtotalk') return enqueue('ptt', () => release(context), context, record.action);
        if (event === 'willAppear' || event === 'didReceiveSettings') { renderAll(); return refresh(); }
    }
    return {
        dispatch(data) { if (stopped) return Promise.resolve(); try { return track(handle(data), data?.context, data?.action); } catch (e) { fail(data?.context, e, data?.action); return Promise.resolve(); } },
        async poll({refresh: shouldRefresh = true} = {}) {
            monitor.tick();
            await enqueue('ptt', async () => {
                for (const context of [...held.keys()]) if (releases.has(context) || !contexts.get(context)?.visible) {
                    try { await release(context); } catch (e) { fail(context, e); }
                }
            });
            if (shouldRefresh && contexts.size) await refresh(); else renderAll();
        },
        disconnect() { epoch++; contexts.clear(); rendered.clear(); pending.clear(); monitor.stop(); return enqueue('ptt', cleanup); },
        shutdown() { stopped = true; epoch++; monitor.stop(); contexts.clear(); pending.clear(); return enqueue('ptt', cleanup); },
        async idle() { while (work.size) await Promise.all([...work]); },
        monitor
    };
}

function run() {
    const WebSocket = require('ws');
    const args = process.argv.slice(2), arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
    const port = Number(arg('-port')), uuid = arg('-pluginUUID'), register = arg('-registerEvent');
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !uuid || !register) return;
    let socket, retry, quitting = false;
    const send = data => { if (socket?.readyState === WebSocket.OPEN) { try { socket.send(JSON.stringify(data)); } catch (e) { console.error(e.message); } } };
    const log = message => { console.error('[Audio Switch]', message); send({event: 'logMessage', payload: {message: '[Audio Switch] ' + message}}); };
    const monitor = createTelemetry({helper: nativeHelper, log, autoTimers: true,
        spawnWatch: () => spawn(helperPath, ['watch'], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']})});
    const controller = createController({send, image: Icons.createImageLoader(path.join(__dirname, '..', 'images')), telemetry: monitor, log});
    function connect() {
        if (quitting) return;
        socket = new WebSocket(`ws://127.0.0.1:${port}`, {maxPayload: 1024 * 1024});
        socket.on('open', () => { send({event: register, uuid}); monitor.start(); });
        socket.on('message', message => { try { controller.dispatch(JSON.parse(message.toString())); } catch (e) { log('Malformed host message: ' + e.message); } });
        socket.on('error', e => console.error('Host connection:', e.message));
        socket.on('close', () => { controller.disconnect().finally(() => { if (!quitting) retry = setTimeout(connect, 3000); }); });
    }
    const timer = setInterval(() => { controller.poll({refresh: false}).catch(e => log(e.message)); }, 2000);
    async function shutdown() {
        if (quitting) return; quitting = true; clearInterval(timer); clearTimeout(retry);
        await controller.shutdown(); socket?.close(); process.exit(0);
    }
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    connect();
}
if (require.main === module) run();
module.exports = {createController, nativeHelper, launchUri};
