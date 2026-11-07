'use strict';
const fs = require('node:fs');
const path = require('node:path');
const digits = require('./icon-digits.json');
const Catalog = require('./device-catalog');
const BADGE = /<!-- POSITION_BADGE_START -->[\s\S]*?<!-- POSITION_BADGE_END -->/;
function assetFor(kind, type = 'output') {
    return Catalog.get(Catalog.normalizeKind(kind, type)).asset;
}
function withPosition(svg, number) {
    if (!BADGE.test(svg) || number === null || number === undefined) return svg;
    let badge = '';
    if (Number.isInteger(number) && number >= 1 && number <= 32) {
        const parts = String(number).split('').map(d => digits[d]);
        const color = /data-badge-color="(#[a-f0-9]{6})"/i.exec(svg)?.[1] || '#4fc3f7';
        const ink = /data-badge-ink="(#[a-f0-9]{6})"/i.exec(svg)?.[1] || '#0d2137';
        let x = 72 - parts.reduce((width, d) => width + d.advance, 0) / 2;
        badge = `<g id="position-badge" data-position="${number}" fill="${ink}"><circle cx="72" cy="120" r="12" fill="${color}"/>`;
        for (const part of parts) { badge += `<path d="${part.path}" transform="translate(${x} 125)"/>`; x += part.advance; }
        badge += '</g>';
    }
    // Keep the markers, so the same SVG can safely switch on -> off -> on again.
    return svg.replace(BADGE, () => '<!-- POSITION_BADGE_START -->' + badge + '<!-- POSITION_BADGE_END -->');
}
const STATUSES = new Set(['inactive', 'active', 'partial', 'unavailable', 'unknown', 'unconfigured']);
function withStatus(svg, status = 'inactive', pending = false) {
    if (!STATUSES.has(status)) throw new Error('Invalid indicator status');
    // Markers make repeated composition idempotent; no filters, fonts or raster data.
    svg = svg.replace(/<!-- STATUS_DIM_START -->[\s\S]*?<!-- STATUS_DIM_END -->/g, '')
        .replace(/<!-- STATUS_OVERLAY_START -->[\s\S]*?<!-- STATUS_OVERLAY_END -->/g, '');
    if (status === 'unavailable') {
        const dim = '<!-- STATUS_DIM_START --><rect width="144" height="144" rx="35" fill="#0c111b" opacity=".62"/><!-- STATUS_DIM_END -->';
        svg = svg.includes('<!-- POSITION_BADGE_START -->') ? svg.replace('<!-- POSITION_BADGE_START -->', dim + '<!-- POSITION_BADGE_START -->') : svg.replace('</svg>', dim + '</svg>');
    }
    let overlay = '';
    if (status === 'active') {
        overlay += '<rect x="5" y="5" width="134" height="134" rx="31" fill="none" stroke="#f1fcff" stroke-width="4"/>';
        overlay += '<circle cx="72" cy="14" r="9" fill="#f1fcff"/><path d="M67.5 14l3 3 6-6" fill="none" stroke="#123a42" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    } else if (status === 'partial') {
        overlay += '<rect x="5" y="5" width="134" height="134" rx="31" fill="none" stroke="#ffd082" stroke-width="4" stroke-dasharray="11 8"/>';
        overlay += '<circle cx="72" cy="14" r="9" fill="#ffd082"/><path d="M67 14h10" stroke="#402b12" stroke-width="2.7" stroke-linecap="round"/>';
    } else if (status === 'unknown') {
        overlay += '<circle cx="72" cy="14" r="9" fill="#b8c5d6"/><path d="M69 11a3 3 0 1 1 4.6 2.5c-1.6 1-1.6 1.2-1.6 2.1" fill="none" stroke="#172435" stroke-width="2" stroke-linecap="round"/><circle cx="72" cy="18.4" r="1" fill="#172435"/>';
    } else if (status === 'unavailable') {
        overlay += '<circle cx="72" cy="14" r="9" fill="#aeb7c6"/><path d="M69 9l-3 3a3 3 0 0 0 4 4m5 3 3-3a3 3 0 0 0-4-4M66 8l12 12" fill="none" stroke="#172435" stroke-width="2" stroke-linecap="round"/>';
    }
    if (pending) overlay += '<g fill="#f3f7fc" stroke="#172435" stroke-width="1"><circle cx="103" cy="15" r="2.4"/><circle cx="110" cy="15" r="2.4"/><circle cx="117" cy="15" r="2.4"/></g>';
    return svg.replace('</svg>', '<!-- STATUS_OVERLAY_START --><g id="device-status" data-status="' + status + '" data-pending="' + Boolean(pending) + '">' + overlay + '</g><!-- STATUS_OVERLAY_END --></svg>');
}
function createImageLoader(directory, limit = 384) {
    const files = new Map(), rendered = new Map();
    const maximum = Math.max(1, Math.min(512, Math.trunc(limit) || 384));
    const load = (name, position = null, appearance = null) => {
        if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Invalid icon asset');
        const status = appearance?.status || 'inactive', pending = Boolean(appearance?.pending);
        const key = JSON.stringify([name, position, appearance ? status : null, pending]);
        if (rendered.has(key)) { const value = rendered.get(key); rendered.delete(key); rendered.set(key, value); return value; }
        if (!files.has(name)) files.set(name, fs.readFileSync(path.join(directory, name + '.svg'), 'utf8'));
        let svg = withPosition(files.get(name), position);
        if (appearance) svg = withStatus(svg, status, pending);
        const value = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
        rendered.set(key, value);
        while (rendered.size > maximum) rendered.delete(rendered.keys().next().value);
        return value;
    };
    load.cacheSize = () => rendered.size;
    return load;
}
module.exports = {assetFor, withPosition, withStatus, createImageLoader};
