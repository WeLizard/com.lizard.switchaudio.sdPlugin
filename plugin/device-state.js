'use strict';
// Pure classification: no Windows IO, titles or persistent click history.
const ROLES = Object.freeze({all: ['console', 'multimedia', 'communications'], media: ['console', 'multimedia'], communications: ['communications']});
const MAX_AGE_MS = 5000;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function validSnapshot(s) {
    if (!object(s) || s.success !== true || s.schemaVersion !== 2 || typeof s.consistent !== 'boolean' ||
        typeof s.session !== 'string' || !s.session || s.session.length > 128 ||
        !Number.isSafeInteger(s.revision) || s.revision < 1 || !object(s.flows)) return false;
    for (const type of ['output', 'input']) {
        const f = s.flows[type];
        if (!object(f) || !object(f.inventory) || !object(f.defaults)) return false;
        const inv = f.inventory;
        if (!['ok', 'error'].includes(inv.status) || typeof inv.complete !== 'boolean' || !Array.isArray(inv.devices) || inv.devices.length > 512) return false;
        const ids = new Set();
        for (const d of inv.devices) {
            if (!object(d) || typeof d.id !== 'string' || !d.id || d.id.length > 4096 || ids.has(d.id)) return false;
            if (d.state !== null && ![1, 2, 4, 8].includes(d.state)) return false;
            ids.add(d.id);
        }
        for (const role of ROLES.all) {
            const d = f.defaults[role];
            if (!object(d) || !['ok', 'error'].includes(d.status)) return false;
            if (d.status === 'ok' && d.id !== null && (typeof d.id !== 'string' || !d.id || d.id.length > 4096)) return false;
        }
    }
    return true;
}
function fresh(sample, now) { return sample && validSnapshot(sample.data) && sample.data.consistent === true && Number.isFinite(sample.at) && now - sample.at >= 0 && now - sample.at <= MAX_AGE_MS; }
function classify(sample, type, selection, id, now) {
    const required = ROLES[selection] || ROLES.all;
    const result = (status, reason, matches = []) => ({status, reason, required, matches});
    if (!id || typeof id !== 'string') return result('unconfigured', 'no_target');
    if (!fresh(sample, now)) return result('unknown', 'stale_or_unreadable');
    const flow = sample.data.flows[type === 'input' ? 'input' : 'output'];
    const inv = flow.inventory, device = inv.devices.find(d => d.id === id);
    if (!device) return inv.status === 'ok' && inv.complete ? result('unavailable', 'not_present') : result('unknown', 'incomplete_inventory');
    if (device.state === null) return result('unknown', 'device_state_error');
    if (device.state !== 1) return result('unavailable', ({2:'disabled', 4:'not_present', 8:'unplugged'})[device.state]);
    if (required.some(role => flow.defaults[role].status !== 'ok')) return result('unknown', 'role_read_error');
    const matches = required.filter(role => flow.defaults[role].id === id);
    return result(matches.length === required.length ? 'active' : matches.length ? 'partial' : 'inactive', 'confirmed', matches);
}
function defaultId(sample, type, roles, now) {
    if (!fresh(sample, now)) return null;
    const entry = sample.data.flows[type === 'input' ? 'input' : 'output'].defaults[roles === 'communications' ? 'communications' : 'console'];
    return entry.status === 'ok' ? entry.id : null;
}
function availableDevices(sample, type, now, roles = 'all') {
    if (!fresh(sample, now)) throw new Error('Cannot confirm Windows audio state. Refresh and try again.');
    const flow = sample.data.flows[type === 'input' ? 'input' : 'output'];
    if (flow.inventory.status !== 'ok' || !flow.inventory.complete) throw new Error('Windows audio inventory is incomplete.');
    if ((ROLES[roles] || ROLES.all).some(role => flow.defaults[role].status !== 'ok')) throw new Error('Cannot read Windows default audio roles.');
    return flow.inventory.devices.filter(d => d.state === 1).map(d => ({...d,
        default: flow.defaults.console.id === d.id, defaultMultimedia: flow.defaults.multimedia.id === d.id,
        defaultComm: flow.defaults.communications.id === d.id}));
}
module.exports = {ROLES, MAX_AGE_MS, validSnapshot, fresh, classify, defaultId, availableDevices};
