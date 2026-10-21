/* Shared by Node and the Property Inspector. No host or Windows dependencies. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AudioSettings = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    const MAX_DEVICES = 32;
    function text(value, max = 512) { return typeof value === 'string' ? value.slice(0, max).trim() : ''; }
    function number(value, fallback, min, max) {
        if (value === '' || value === null || value === undefined || typeof value === 'boolean') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    }
    function normalize(raw) {
        const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        // An explicitly empty v2 list must not resurrect a deleted legacy pair.
        const old = [1, 2].filter(i => s['device' + i]).map(i => ({
            id: s['device' + i], name: s['device' + i + 'Name'],
            icon: i === 2 ? 'headphones' : 'speakers'
        }));
        const source = Array.isArray(s.devices) ? s.devices : old;
        const seen = new Set();
        const devices = source.slice(0, MAX_DEVICES).map(d => {
            d = d && typeof d === 'object' ? d : {};
            return {id: text(d.id), name: text(d.name), label: text(d.label, 40),
                icon: ['speakers', 'headphones', 'microphone'].includes(d.icon) ? d.icon : 'speakers'};
        }).filter(d => { if (!d.id || seen.has(d.id)) return false; seen.add(d.id); return true; });
        return {...s, schemaVersion: 2, devices,
            deviceType: s.deviceType === 'input' ? 'input' : 'output',
            mode: s.mode === 'selected' ? 'selected' : 'cycle',
            roles: ['all', 'media', 'communications'].includes(s.roles) ? s.roles : 'all',
            skipUnavailable: s.skipUnavailable !== false,
            showDeviceName: s.showDeviceName !== false,
            direction: s.direction === 'previous' ? 'previous' : 'next'};
    }
    function currentDevice(devices, roles) {
        return devices.find(d => roles === 'communications' ? d.defaultComm : d.default) || null;
    }
    function chooseTarget(raw, available) {
        const s = normalize(raw);
        if (!Array.isArray(available)) throw new Error('Invalid audio device list');
        const configured = s.devices;
        if (!configured.length) throw new Error('Choose at least one audio device in the button settings.');
        const online = new Set(available.map(d => d.id));
        if (s.mode === 'selected') {
            if (!online.has(configured[0].id)) throw new Error('The selected device is disconnected or disabled.');
            return configured[0];
        }
        const active = currentDevice(available, s.roles);
        let index = configured.findIndex(d => active && d.id === active.id);
        // When the Windows default is outside the list, start at the first configured device.
        const direction = s.direction === 'previous' ? -1 : 1;
        if (index < 0) index = direction === 1 ? -1 : 1;
        for (let count = 0; count < configured.length; count++) {
            index = (index + direction + configured.length) % configured.length;
            const target = configured[index];
            if (online.has(target.id)) return target;
            if (!s.skipUnavailable) throw new Error('The next device is disconnected or disabled: ' + (target.label || target.name || target.id));
        }
        throw new Error('None of the configured audio devices is available.');
    }
    function volumeStep(s = {}) {
        if (s.volumeStepPercent !== undefined) return number(s.volumeStepPercent, 5, 1, 100);
        return s.volumeStep !== undefined ? number(Number(s.volumeStep) / 655.35, 5, 1, 100) : 5;
    }
    return {MAX_DEVICES, text, number, normalize, currentDevice, chooseTarget, volumeStep};
}));
