'use strict';
const {execFile} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const S = require('./settings');
const PREFIX = 'com.lizard.switchaudio.';

// No shell interpolation, external utilities or runtime downloads.
function nativeHelper(args) {
    return new Promise((resolve, reject) => {
        execFile(path.join(__dirname, 'AudioSwitch.exe'), args.map(String), {
            encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024
        }, (error, stdout) => {
            let result;
            try { result = JSON.parse((stdout || '').replace(/^\uFEFF/, '').trim()); }
            catch { return reject(new Error(error ? `Audio helper failed: ${error.code || error.message}` : 'Invalid response from AudioSwitch.exe')); }
            if (!result || typeof result !== 'object') return reject(new Error('Invalid audio helper result'));
            if (error || result.success === false || result.error) return reject(new Error(result.error || error.message));
            resolve(result);
        });
    });
}

function createController({helper = nativeHelper, send, image, log = () => {}, delay = ms => new Promise(r => setTimeout(r, ms))}) {
    const contexts = new Map(), held = new Map(), rendered = new Map(), releases = new Set();
    let tail = Promise.resolve(), pollPending = false, stopped = false;
    const emit = (event, context, payload, action) => send({event, context, ...(payload === undefined ? {} : {payload}), ...(action ? {action} : {})});
    function fail(context, error, action) {
        const message = error instanceof Error ? error.message : String(error);
        log(message); if (context) {
            emit('showAlert', context);
            emit('sendToPropertyInspector', context, {error: message}, action || contexts.get(context)?.action);
        }
    }
    function enqueue(operation, context, action) {
        const task = tail.then(operation);
        tail = task.catch(e => fail(context, e, action));
        return tail;
    }
    function paint(context, icon, state = 0, title) {
        const signature = JSON.stringify([icon, state, title]);
        if (rendered.get(context) === signature) return;
        emit('setState', context, {state});
        emit('setImage', context, {image: image(icon), target: 0});
        if (title !== undefined) emit('setTitle', context, {title, target: 0});
        rendered.set(context, signature);
    }
    function render(context, record, snapshot) {
        const s = record.settings, action = record.action.slice(PREFIX.length);
        if (action === 'toggle') {
            const active = snapshot[s.deviceType + (s.roles === 'communications' ? 'Comm' : '')];
            const index = s.devices.findIndex(d => d.id === active?.id), device = s.devices[index];
            const icon = s.deviceType === 'input' || device?.icon === 'microphone' ? 'mic_device1' : device?.icon === 'headphones' ? 'device2' : 'device1';
            const title = !s.showDeviceName ? null : active ? `${index < 0 ? '—' : (index + 1) + '/' + s.devices.length}\n${device?.label || device?.name || active.name}` : '—';
            paint(context, icon, 0, title);
        } else if (action === 'mute') {
            const active = snapshot[s.muteType === 'microphone' ? 'input' : 'output'];
            if (!active) { paint(context, s.muteType === 'microphone' ? 'mic_mute' : 'dev_mute', 0); return; }
            paint(context, (s.muteType === 'microphone' ? 'mic_' : 'dev_') + (active.muted ? 'mute' : 'unmute'), active.muted ? 1 : 0);
        } else if (action === 'pushtotalk') {
            paint(context, held.has(context) && !releases.has(context) ? 'ptt_on' : 'ptt_off', held.has(context) && !releases.has(context) ? 1 : 0);
        } else if (action === 'setvolume') {
            const volume = S.number(s.targetVolume, 50, 0, 100);
            paint(context, 'volume_' + (volume === 0 ? 0 : Math.ceil(volume / 25) * 25));
        } else if (action === 'playpause') paint(context, 'play'); // A media key is not playback telemetry.
    }
    async function refresh() {
        if (!contexts.size) return;
        const snapshot = await helper(['snapshot']);
        for (const [context, record] of contexts) if (record.visible) render(context, record, snapshot);
    }
    async function release(context) {
        const id = held.get(context);
        if (!id) { releases.delete(context); return; }
        releases.add(context);
        // Keep failed releases recorded so the next poll or shutdown can retry.
        if (![...held].some(([key, otherId]) => key !== context && otherId === id && !releases.has(key))) await helper(['mute', 'input', '1', id]);
        held.delete(context); releases.delete(context);
    }
    async function cleanup() {
        for (const context of [...held.keys()]) {
            try { await release(context); } catch (e) { fail(context, e); }
        }
    }
    async function keyDown(context, record) {
        const s = record.settings, action = record.action.slice(PREFIX.length);
        switch (action) {
            case 'toggle': {
                const available = await helper(['list', s.deviceType]);
                const target = S.chooseTarget(s, available);
                await helper(['set', target.id, s.deviceType, s.roles]);
                break;
            }
            case 'mute': await helper(['mute', s.muteType === 'microphone' ? 'input' : 'output', 'toggle']); break;
            case 'volumeup': case 'volumedown':
                await helper(['volume', 'output', 'change', String(S.volumeStep(s) * (action === 'volumeup' ? 1 : -1))]); break;
            case 'setvolume': await helper(['volume', 'output', 'set', String(S.number(s.targetVolume, 50, 0, 100))]); break;
            case 'appvolumeup': case 'appvolumedown': {
                const name = S.text(s.processName, 260) || 'focused';
                const step = S.number(s.appVolumeStep, .1, .01, 1) * (action === 'appvolumeup' ? 1 : -1);
                await helper(['appvolume', name, String(step)]); break;
            }
            case 'pushtotalk': {
                if (held.has(context)) return;
                const status = await helper(['status', 'input']);
                held.set(context, status.id);
                try { await helper(['mute', 'input', '0', status.id]); }
                catch (e) { await release(context).catch(cleanupError => fail(context, cleanupError)); throw e; }
                break;
            }
            case 'playpause': {
                const appPath = S.text(s.appPath, 2048);
                if (appPath) {
                    let name = S.text(s.processName, 260);
                    if (!name && /\.exe$/i.test(appPath)) name = path.win32.basename(appPath);
                    if (!name) throw new Error('Set the process name when launching a shortcut or application URI.');
                    if (!(await helper(['running', name])).running) { await helper(['launch', appPath]); await delay(1500); }
                }
                await helper(['media', 'playpause']); break;
            }
            case 'medianext': await helper(['media', 'next']); break;
            case 'mediaprev': await helper(['media', 'previous']); break;
            case 'soundsettings': await helper(['soundsettings']); break;
            default: return;
        }
        await refresh();
    }
    async function handle(data) {
        const {event, context, action, device} = data, payload = data.payload || {};
        if (event === 'deviceDidDisconnect') {
            for (const [key, record] of contexts) if (record.device === device) {
                try { await release(key); } finally { contexts.delete(key); rendered.delete(key); }
            }
            return;
        }
        if (event === 'sendToPlugin' && payload.requestDevices) {
            const deviceType = payload.deviceType === 'input' ? 'input' : 'output';
            try {
                const devices = await helper(['list', deviceType]);
                emit('sendToPropertyInspector', context, {devices, deviceType, requestId: payload.requestId}, action);
            } catch (e) { emit('sendToPropertyInspector', context, {error: e.message, deviceType, requestId: payload.requestId}, action); }
            return;
        }
        if (event === 'willDisappear') {
            try { await release(context); } finally { contexts.delete(context); rendered.delete(context); } return;
        }
        if (!context || !(action || contexts.get(context)?.action || '').startsWith(PREFIX)) return;
        if (event === 'willAppear' || event === 'didReceiveSettings' || !contexts.has(context)) {
            const previous = contexts.get(context);
            const settings = S.normalize(payload.settings || previous?.settings || {});
            contexts.set(context, {action: action || previous.action, settings, device: device || previous?.device,
                visible: event === 'willAppear' || previous?.visible === true});
            rendered.delete(context);
        }
        const record = contexts.get(context);
        if (event === 'keyDown') await keyDown(context, record);
        else if (event === 'keyUp' && record.action === PREFIX + 'pushtotalk') { await release(context); await refresh(); }
        else if (event === 'willAppear' || event === 'didReceiveSettings') await refresh();
    }
    return {
        dispatch(data) { if (stopped) return Promise.resolve(); return enqueue(() => handle(data), data.context, data.action); },
        poll() {
            if (stopped || pollPending || (!releases.size && ![...contexts.values()].some(r => r.visible))) return Promise.resolve();
            pollPending = true;
            return enqueue(async () => {
                for (const key of [...held.keys()]) if (releases.has(key) || !contexts.get(key)?.visible) await release(key);
                await refresh();
            }).finally(() => { pollPending = false; });
        },
        disconnect() { return enqueue(async () => { await cleanup(); contexts.clear(); rendered.clear(); }); },
        shutdown() { stopped = true; return enqueue(cleanup); },
        idle() { return tail; }
    };
}

function run() {
    const WebSocket = require('ws');
    const args = process.argv.slice(2), arg = name => args[args.indexOf(name) + 1];
    const port = Number(arg('-port')), uuid = arg('-pluginUUID'), register = arg('-registerEvent');
    if (!args.includes('-port') || !Number.isInteger(port) || port < 1 || port > 65535 || !uuid || !register) return;
    let socket, retry, quitting = false;
    const images = new Map();
    const send = data => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
    const controller = createController({send, image(name) {
        if (!images.has(name)) images.set(name, 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, '..', 'images', name + '.svg')).toString('base64'));
        return images.get(name);
    }, log(message) { console.error('[Audio Switch]', message); send({event: 'logMessage', payload: {message: '[Audio Switch] ' + message}}); }});
    function connect() {
        if (quitting) return;
        socket = new WebSocket(`ws://127.0.0.1:${port}`, {maxPayload: 1024 * 1024});
        socket.on('open', () => send({event: register, uuid}));
        socket.on('message', message => {
            try { controller.dispatch(JSON.parse(message.toString())); }
            catch (e) { console.error('Malformed host message:', e.message); }
        });
        socket.on('error', e => console.error('Host connection:', e.message));
        socket.on('close', () => { controller.disconnect().finally(() => { if (!quitting) retry = setTimeout(connect, 3000); }); });
    }
    const timer = setInterval(() => { controller.poll(); }, 2000);
    async function shutdown() {
        if (quitting) return; quitting = true; clearInterval(timer); clearTimeout(retry);
        await controller.shutdown(); socket?.close(); process.exit(0);
    }
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    connect();
}
if (require.main === module) run();
module.exports = {createController, nativeHelper};
