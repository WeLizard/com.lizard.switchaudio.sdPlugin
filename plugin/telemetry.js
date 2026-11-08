'use strict';
const {StringDecoder} = require('node:string_decoder');
const State = require('./device-state');

// One observation source per plugin. A watcher has exclusive publication ownership;
// a fallback result started before a watcher restart cannot overwrite newer frames.
function createTelemetry({helper, spawnWatch = null, now = () => performance.now(), log = () => {},
    schedule = setTimeout, cancel = clearTimeout, requestTimeout = 4000, autoTimers = false} = {}) {
    let sample = null, started = false, closed = false, child = null, owner = 0;
    let retryTimer = null, heartbeatTimer = null, retryDelay = 1500, lastFallback = -Infinity;
    let ticket = 0, pollBusy = false, pollScheduled = false, flushScheduled = false;
    const waiters = new Map(), subscribers = new Set();
    function publish(data) {
        sample = data ? {data, at: now()} : null;
        for (const subscriber of subscribers) { try { subscriber(sample); } catch (e) { log(e.message); } }
    }
    function finish(through) {
        for (const [id, waiter] of waiters) if (id <= through) {
            if (waiter.timer) cancel(waiter.timer);
            waiters.delete(id); waiter.resolve(sample);
        }
    }
    function retire(entry) {
        if (!entry || entry.retired) return;
        entry.retired = true;
        try { entry.process.stdin.end('quit\n'); } catch { }
        const kill = schedule(() => { try { entry.process.kill(); } catch { } }, 500);
        kill?.unref?.();
        entry.process.once('exit', () => cancel(kill));
    }
    function scheduleRestart() {
        if (!started || closed || !spawnWatch || retryTimer) return;
        retryTimer = schedule(() => { retryTimer = null; openWatcher(); }, retryDelay);
        retryTimer?.unref?.(); retryDelay = Math.min(15000, retryDelay * 2);
    }
    function failed(entry, error) {
        if (child !== entry || entry.retired || closed) return;
        log('Audio watcher: ' + (error?.message || error));
        child = null; owner++; retire(entry);
        for (const waiter of waiters.values()) { if (waiter.timer) cancel(waiter.timer); waiter.timer = null; }
        publish(null);
        scheduleRestart(); requestPoll();
    }
    function accept(entry, frame) {
        if (closed || child !== entry || entry.retired) return;
        if (!State.validSnapshot(frame) || !Number.isSafeInteger(frame.requestId) || frame.requestId < 0 || frame.requestId > ticket)
            return failed(entry, new Error('Invalid telemetry frame'));
        if (entry.session && frame.session !== entry.session) return failed(entry, new Error('Unexpected telemetry session'));
        if (frame.revision <= entry.revision) return; // duplicate/out-of-order within a live process
        entry.session = frame.session; entry.revision = frame.revision; entry.at = now();
        retryDelay = 1500;
        publish(frame); finish(frame.requestId);
    }
    function openWatcher() {
        if (closed || child || !spawnWatch) return;
        const entry = {process: null, retired: false, session: '', revision: 0, at: now(), text: '', decoder: new StringDecoder('utf8')};
        owner++;
        try { entry.process = spawnWatch(); child = entry; }
        catch (e) { log('Cannot start audio watcher: ' + e.message); scheduleRestart(); requestPoll(); return; }
        entry.process.stdout.on('data', data => {
            if (child !== entry || entry.retired) return;
            entry.text += entry.decoder.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
            if (Buffer.byteLength(entry.text, 'utf8') > 2 * 1024 * 1024) return failed(entry, new Error('Telemetry buffer limit exceeded'));
            let end;
            while ((end = entry.text.indexOf('\n')) >= 0) {
                const line = entry.text.slice(0, end).replace(/\r$/, ''); entry.text = entry.text.slice(end + 1);
                if (!line.trim()) continue;
                if (Buffer.byteLength(line, 'utf8') > 1024 * 1024) return failed(entry, new Error('Telemetry line limit exceeded'));
                try { accept(entry, JSON.parse(line)); } catch (e) { failed(entry, e); }
                if (child !== entry) return;
            }
        });
        entry.process.stderr?.on('data', data => log('Audio helper: ' + String(data).slice(0, 2048)));
        entry.process.stdin.on('error', e => failed(entry, e));
        entry.process.on('error', e => failed(entry, e));
        entry.process.on('exit', () => failed(entry, new Error('Watcher exited')));
        // Always send a fence after startup so pre-existing waiters can be completed.
        flushWatch();
    }
    function flushWatch() {
        if (flushScheduled) return;
        flushScheduled = true;
        queueMicrotask(() => {
            flushScheduled = false;
            const entry = child;
            if (closed) return;
            if (!entry) { requestPoll(); return; }
            try {
                entry.process.stdin.write('refresh ' + ticket + '\n');
                for (const waiter of waiters.values()) if (!waiter.timer) {
                    waiter.timer = schedule(() => failed(entry, new Error('Snapshot request timed out')), requestTimeout);
                    waiter.timer?.unref?.();
                }
            } catch (e) { failed(entry, e); }
        });
    }
    function requestPoll() {
        if (closed || child || pollBusy || pollScheduled) return;
        pollScheduled = true;
        queueMicrotask(async () => {
            pollScheduled = false;
            if (closed || child) return;
            pollBusy = true;
            try {
                // Dirty demand: requests received during a read require another read.
                do {
                    const through = ticket, readOwner = owner;
                    lastFallback = now();
                    try {
                        const data = await helper(['snapshot-v3']);
                        if (!State.validSnapshot(data)) throw new Error('Incompatible audio snapshot; install the complete plugin package.');
                        if (!closed && owner === readOwner && !child) publish(data);
                    } catch (e) {
                        if (!closed && owner === readOwner && !child) { log('Audio snapshot: ' + e.message); publish(null); }
                    }
                    if (!closed && owner === readOwner && !child) finish(through);
                    if (child) { flushWatch(); break; }
                } while (!closed && waiters.size);
            } finally { pollBusy = false; }
        });
    }
    function refresh() {
        if (closed) return Promise.resolve(null);
        const id = ++ticket;
        const promise = new Promise(resolve => waiters.set(id, {resolve, timer: null}));
        if (child) flushWatch(); else requestPoll();
        return promise;
    }
    function tick() {
        if (closed) return;
        if (sample && now() - sample.at > State.MAX_AGE_MS) publish(null);
        if (child && now() - child.at > 6000) failed(child, new Error('Watcher heartbeat is stale'));
        if (!child && now() - lastFallback >= 2000) refresh();
    }
    return {
        refresh, tick,
        getSample: () => sample,
        subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
        start() {
            if (started && !closed) return;
            started = true; closed = false; publish(null);
            if (spawnWatch) openWatcher(); else refresh();
            if (autoTimers) {
                const next = () => { if (closed) return; tick(); heartbeatTimer = schedule(next, 500); heartbeatTimer?.unref?.(); };
                heartbeatTimer = schedule(next, 500); heartbeatTimer?.unref?.();
            }
        },
        stop() {
            closed = true; started = false; owner++;
            cancel(retryTimer); retryTimer = null; cancel(heartbeatTimer); heartbeatTimer = null;
            const entry = child; child = null; retire(entry); publish(null); finish(Infinity);
        },
        // Debug metadata, no process handles or arbitrary execution exposed.
        info: () => ({watcher: Boolean(child), pending: waiters.size, fallbackRunning: pollBusy})
    };
}
module.exports = {createTelemetry};
