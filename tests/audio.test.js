'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../plugin/settings');
const {createController}=require('../plugin/main');
const prefix='com.lizard.switchaudio.';
const configured=['a','b','c'].map((id,i)=>({id,name:['Маленькие','Большие','Наушники'][i]}));
const available=current=>configured.map(d=>({...d,default:d.id===current,defaultComm:d.id==='c'}));
const settings={devices:configured};
test('legacy two-device profile migrates without changing order or UUIDs',()=>assert.deepEqual(S.normalize({device1:'a',device2:'b',device1Name:'One'}).devices.map(d=>d.id),['a','b']));
test('explicit empty v2 list does not resurrect legacy fields',()=>assert.equal(S.normalize({devices:[],device1:'a'}).devices.length,0));
test('three-device cycle wraps using the actual Windows default',()=>{for(const [a,b] of [['a','b'],['b','c'],['c','a']])assert.equal(S.chooseTarget(settings,available(a)).id,b);});
test('external changes override stale persisted currentState',()=>assert.equal(S.chooseTarget({...settings,currentState:0},available('b')).id,'c'));
test('unknown default starts at first configured device in either direction',()=>{for(const direction of ['next','previous'])assert.equal(S.chooseTarget({...settings,direction},available('outside')).id,'a');});
test('reverse cycle wraps',()=>assert.equal(S.chooseTarget({...settings,direction:'previous'},available('a')).id,'c'));
test('communications mode follows the communications default',()=>assert.equal(S.chooseTarget({...settings,roles:'communications'},available('a')).id,'a'));
test('offline middle entry skipped without losing configuration',()=>assert.equal(S.chooseTarget(settings,available('a').filter(d=>d.id!=='b')).id,'c'));
test('offline entry fails explicitly when skipping disabled',()=>assert.throws(()=>S.chooseTarget({...settings,skipUnavailable:false},available('a').filter(d=>d.id!=='b')),/disconnected/));
test('selected mode never picks an unrelated online device',()=>assert.throws(()=>S.chooseTarget({...settings,mode:'selected'},available('b').filter(d=>d.id!=='a')),/disconnected/));
test('all offline and empty configuration fail usefully',()=>{assert.throws(()=>S.chooseTarget(settings,[]),/None/);assert.throws(()=>S.chooseTarget({},[]),/Choose/);});
test('duplicate IDs removed, duplicate names preserved',()=>assert.deepEqual(S.normalize({devices:[{id:'a',name:'Speakers'},{id:'b',name:'Speakers'},{id:'a'}]}).devices.map(d=>d.id),['a','b']));
test('zero volume preserved; malformed and unbounded values normalized',()=>{assert.equal(S.number(0,50,0,100),0);assert.equal(S.number('0',50,0,100),0);assert.equal(S.number(NaN,50,0,100),50);assert.equal(S.number('abc',50,0,100),50);assert.equal(S.number(120,50,0,100),100);assert.equal(S.volumeStep({volumeStep:6553.5}),10);});
test('device cap and safe Unicode labels',()=>{assert.equal(S.normalize({devices:Array.from({length:99},(_,i)=>({id:String(i)}))}).devices.length,32);assert.equal(S.normalize(settings).devices[2].name,'Наушники');});
function fixture(){
    const calls=[],sent=[],errors=[];
    const state={output:'a',input:'mic1',comm:'c',muted:false,volume:50,failSet:false,failMute:false};
    const helper=async args=>{
        calls.push(args);await new Promise(r=>setTimeout(r,1));
        switch(args[0]){
            case 'snapshot':return {success:true,output:{id:state.output,name:state.output,muted:state.muted},input:{id:state.input,name:'Mic',muted:false},outputComm:{id:state.comm,name:state.comm},inputComm:null};
            case 'list':return available(state.output);
            case 'set':if(state.failSet)throw new Error('Device unavailable');state.output=args[1];return {success:true};
            case 'status':return {id:state.input,name:'Mic',muted:true};
            case 'mute':if(args[2]==='1'&&state.failMute)throw new Error('Temporary disconnect');state.muted=args[2]==='toggle'?!state.muted:args[2]==='1';return {success:true};
            case 'volume':state.volume=Number(args[3]);return {success:true};
            case 'appvolume':throw new Error('Named app has no audio sessions');
            default:return {success:true};
        }
    };
    const controller=createController({helper,send:d=>sent.push(d),image:n=>'data:image/svg+xml;base64,'+Buffer.from(n).toString('base64'),log:e=>errors.push(e),delay:()=>Promise.resolve()});
    const event=(event,action='toggle',context='key',s=settings)=>controller.dispatch({event,context,device:'deck1',action:prefix+action,payload:{settings:s}});
    return {controller,event,state,calls,sent,errors};
}
test('rapid key presses are serialized and visit all three devices',async()=>{const f=fixture();await f.event('willAppear');await Promise.all([f.event('keyDown'),f.event('keyDown'),f.event('keyDown')]);assert.deepEqual(f.calls.filter(c=>c[0]==='set').map(c=>c[1]),['b','c','a']);});
test('failed switch produces alert and no invented success state',async()=>{const f=fixture();await f.event('willAppear');f.state.failSet=true;await f.event('keyDown');assert.equal(f.state.output,'a');assert(f.sent.some(m=>m.event==='showAlert'));assert(f.errors.some(e=>e.includes('unavailable')));});
test('live refresh updates title after external OS switch',async()=>{const f=fixture();await f.event('willAppear');f.state.output='c';await f.controller.poll();assert(f.sent.some(m=>m.event==='setTitle'&&m.payload.title==='3/3\nНаушники'));});
test('icons are data URIs and switch only uses declared state zero',async()=>{const f=fixture();await f.event('willAppear');assert(f.sent.filter(m=>m.event==='setImage').every(m=>m.payload.image.startsWith('data:image/svg+xml;base64,')));assert(f.sent.filter(m=>m.event==='setState').every(m=>m.payload.state===0));});
test('PTT unmutes on press, mutes the original endpoint on release',async()=>{const f=fixture();await f.event('willAppear','pushtotalk');await f.event('keyDown','pushtotalk');f.state.input='mic2';await f.event('keyUp','pushtotalk');assert.deepEqual(f.calls.filter(c=>c[0]==='mute'),[['mute','input','0','mic1'],['mute','input','1','mic1']]);});
test('PTT rapid down/up preserves operation order',async()=>{const f=fixture();await Promise.all([f.event('keyDown','pushtotalk'),f.event('keyUp','pushtotalk')]);assert.deepEqual(f.calls.filter(c=>c[0]==='mute').map(c=>c[2]),['0','1']);});
test('PTT is released when key disappears',async()=>{const f=fixture();await f.event('keyDown','pushtotalk');await f.event('willDisappear','pushtotalk');assert.equal(f.calls.filter(c=>c[0]==='mute').at(-1)[2],'1');});
test('PTT is released on socket disconnect and graceful shutdown',async()=>{for(const cleanup of ['disconnect','shutdown']){const f=fixture();await f.event('keyDown','pushtotalk');await f.controller[cleanup]();assert.equal(f.calls.filter(c=>c[0]==='mute').at(-1)[2],'1');}});
test('two held PTT keys do not mute until last key released',async()=>{const f=fixture();await f.event('keyDown','pushtotalk','one');await f.event('keyDown','pushtotalk','two');await f.event('keyUp','pushtotalk','one');assert.equal(f.calls.filter(c=>c[0]==='mute'&&c[2]==='1').length,0);await f.event('keyUp','pushtotalk','two');assert.equal(f.calls.filter(c=>c[0]==='mute'&&c[2]==='1').length,1);});
test('failed PTT release is retried on poll',async()=>{const f=fixture();await f.event('willAppear','pushtotalk');await f.event('keyDown','pushtotalk');f.state.failMute=true;await f.event('keyUp','pushtotalk');f.state.failMute=false;await f.controller.poll();assert.equal(f.calls.filter(c=>c[0]==='mute'&&c[2]==='1').length,2);});
test('hardware disconnect releases its held microphone',async()=>{const f=fixture();await f.event('keyDown','pushtotalk');await f.controller.dispatch({event:'deviceDidDisconnect',device:'deck1'});assert.equal(f.calls.filter(c=>c[0]==='mute').at(-1)[2],'1');});
test('explicit app failure never changes the focused app',async()=>{const f=fixture();await f.event('keyDown','appvolumeup','app',{processName:'Music.exe'});assert.deepEqual(f.calls.filter(c=>c[0]==='appvolume'),[['appvolume','Music.exe','0.1']]);assert(f.sent.some(m=>m.event==='showAlert'));});
test('setting 0 percent reaches the native helper unchanged',async()=>{const f=fixture();await f.event('keyDown','setvolume','zero',{targetVolume:0});assert.equal(f.state.volume,0);});
test('unknown action cannot accidentally switch audio',async()=>{const f=fixture();await f.event('keyDown','unknown');assert.equal(f.calls.length,0);});
test('device request keeps request correlation and direction',async()=>{const f=fixture();await f.controller.dispatch({event:'sendToPlugin',context:'pi',action:prefix+'toggle',payload:{requestDevices:true,deviceType:'input',requestId:7}});assert(f.sent.some(m=>m.payload.requestId===7&&m.payload.deviceType==='input'));});
test('play/pause does not advertise fictitious playback state',async()=>{const f=fixture();await f.event('willAppear','playpause');await f.event('keyDown','playpause');assert(f.calls.some(c=>c[0]==='media'));assert(!f.sent.some(m=>m.event==='setSettings'));assert(!f.sent.some(m=>m.event==='setState'&&m.payload.state===1));});
