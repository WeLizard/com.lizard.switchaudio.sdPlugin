'use strict';
let revision = 0;
function makeSnapshot({output = 'a', input = 'mic1', comm = 'c', muted = false, volume = 50, devices = null, media = null} = {}) {
    const ids = devices || ['a', 'b', 'c'];
    const inv = id => ({status: 'ok', complete: true, devices: ids.map(d => ({id: d, name: d, state: 1}))});
    const defaults = id => ({console: {status: 'ok', id}, multimedia: {status: 'ok', id}, communications: {status: 'ok', id: comm}});
    return {
        success: true, schemaVersion: 3, consistent: true, session: 'test', revision: ++revision,
        requestId: 0, generation: 0, watching: false,
        flows: {output: {inventory: inv(output), defaults: defaults(output)}, input: {inventory: {status: 'ok', complete: true, devices: [{id: input, name: 'Mic', state: 1}]}, defaults: {console: {status: 'ok', id: input}, multimedia: {status: 'ok', id: input}, communications: {status: 'ok', id: input}}}},
        controls: {output: {id: output, muted, volume}, input: {id: input, muted: false, volume: 100}},
        media: media || {available: true, sessionCount: 0, session: null}
    };
}
function resetRevision() { revision = 0; }
module.exports = {makeSnapshot, resetRevision};