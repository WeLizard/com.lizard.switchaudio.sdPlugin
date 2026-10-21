'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createController}=require('../plugin/main');
function fixture(){
    let current='mic1'; const calls=[],fail=new Set();
    const controller=createController({send:()=>{},image:()=>'',log:()=>{},helper:async args=>{
        calls.push(args);
        if(args[0]==='snapshot')return {success:true};
        if(args[0]==='status')return {id:current};
        if(args[0]==='mute'&&args[2]==='1'&&fail.has(args[3]))throw new Error('Endpoint offline');
        return {success:true};
    }});
    const event=(event,context)=>controller.dispatch({event,context,device:'deck',action:'com.lizard.switchaudio.pushtotalk',payload:{settings:{}}});
    return {controller,calls,fail,event,setCurrent:id=>{current=id;}};
}
test('device loss cleans up other microphones even when one release fails',async()=>{
    const f=fixture();await f.event('willAppear','one');await f.event('keyDown','one');
    f.setCurrent('mic2');await f.event('willAppear','two');await f.event('keyDown','two');
    f.fail.add('mic1');await f.controller.dispatch({event:'deviceDidDisconnect',device:'deck'});
    assert(f.calls.some(c=>c[0]==='mute'&&c[2]==='1'&&c[3]==='mic2'));
});
test('a failed retry cannot starve pending releases for another microphone',async()=>{
    const f=fixture();await f.event('willAppear','one');await f.event('keyDown','one');
    f.setCurrent('mic2');await f.event('willAppear','two');await f.event('keyDown','two');
    f.fail.add('mic1');f.fail.add('mic2');await f.event('keyUp','one');await f.event('keyUp','two');
    f.fail.delete('mic2');await f.controller.poll();
    assert.equal(f.calls.filter(c=>c[0]==='mute'&&c[2]==='1'&&c[3]==='mic2').length,2);
});
test('disabled device title uses a portable empty string, not null',async()=>{
    const messages=[];const controller=createController({send:m=>messages.push(m),image:()=>'',helper:async()=>({success:true,output:{id:'a',name:'Speakers'}})});
    await controller.dispatch({event:'willAppear',context:'key',action:'com.lizard.switchaudio.toggle',payload:{settings:{devices:[{id:'a'}],showDeviceName:false}}});
    assert(messages.some(m=>m.event==='setTitle'&&m.payload.title===''));
});
