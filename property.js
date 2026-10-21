'use strict';
(() => {
    const S = window.AudioSettings;
    const messages = {
        en: {type:'Device',output:'Output',input:'Input',mode:'Mode',cycle:'Cycle through the list',selected:'Select the first device',empty:'Add the devices in the desired switching order.',add:'+ Device',refresh:'Refresh',options:'Options',roles:'Change',all:'All default roles',media:'Playback / recording only',communications:'Communications only',direction:'Direction',next:'Forward',previous:'Backward',skip:'Skip disconnected devices',title:'Show device name on key',hint:'The key follows the actual Windows default. Applications pinned to a device may ignore a default change.',offline:'Disconnected',choose:'Choose device',label:'Short name on key',speakers:'Speakers',headphones:'Headphones',microphone:'Microphone',up:'Move up',down:'Move down',remove:'Remove',loading:'Reading Windows audio devices…',ready:'Devices found: ',timeout:'No reply from the plugin. Check that AudioSwitch.exe is included and restart StreamDock.',disconnected:'Connection to StreamDock closed.',none:'No active devices found. Connect a device and refresh.',changed:'Input and output lists are separate. The previous list is restored when changing back.'},
        ru: {type:'Устройство',output:'Выход',input:'Вход',mode:'Режим',cycle:'По кругу',selected:'Включить первое',empty:'Добавь устройства в нужном порядке переключения.',add:'+ Устройство',refresh:'Обновить',options:'Дополнительно',roles:'Менять',all:'Все роли Windows',media:'Только обычный звук',communications:'Только связь / звонки',direction:'Порядок',next:'Вперёд',previous:'Назад',skip:'Пропускать отключённые',title:'Название на кнопке',hint:'Кнопка учитывает реальное устройство Windows. Программы с явно выбранным выходом могут не следовать переключению.',offline:'Отключено',choose:'Выбери устройство',label:'Короткая подпись',speakers:'Динамики',headphones:'Наушники',microphone:'Микрофон',up:'Выше',down:'Ниже',remove:'Убрать',loading:'Читаю аудиоустройства Windows…',ready:'Найдено устройств: ',timeout:'Нет ответа плагина. Проверь наличие AudioSwitch.exe и перезапусти StreamDock.',disconnected:'Связь со StreamDock закрыта.',none:'Нет активных устройств. Подключи устройство и обнови список.',changed:'Списки входов и выходов хранятся отдельно; прежний список восстановится при возврате.'},
        zh: {type:'设备',output:'输出',input:'输入',mode:'模式',cycle:'循环切换列表',selected:'选择第一个设备',empty:'按切换顺序添加设备。',add:'+ 设备',refresh:'刷新',options:'选项',roles:'更改',all:'所有默认角色',media:'仅播放 / 录音',communications:'仅通信',direction:'方向',next:'向前',previous:'向后',skip:'跳过已断开的设备',title:'显示设备名称',hint:'按键跟随 Windows 实际默认设备。固定输出设备的应用可能不会切换。',offline:'已断开',choose:'选择设备',label:'按键短名称',speakers:'扬声器',headphones:'耳机',microphone:'麦克风',up:'上移',down:'下移',remove:'删除',loading:'正在读取音频设备…',ready:'找到设备：',timeout:'插件未响应。请检查 AudioSwitch.exe 并重启 StreamDock。',disconnected:'与 StreamDock 的连接已关闭。',none:'没有可用设备。连接后刷新。',changed:'输入和输出列表分别保存。'}
    };
    let language = 'en', socket, uuid, action, settings = S.normalize({}), devices = [], requestId = 0, watchdog;
    const el = id => document.getElementById(id), t = key => messages[language][key];
    function status(text, error = false) { el('status').textContent = text; el('status').className = error ? 'error' : ''; }
    function send(event, payload) {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({event, context:uuid, action, payload}));
    }
    function save() { settings = S.normalize(settings); send('setSettings', settings); }
    function request() {
        clearTimeout(watchdog); requestId++; status(t('loading'));
        send('sendToPlugin', {requestDevices:true, deviceType:settings.deviceType, requestId});
        watchdog = setTimeout(() => status(t('timeout'), true), 10000);
    }
    function button(text, title, disabled, handler) {
        const b = document.createElement('button'); b.textContent=text; b.title=title; b.setAttribute('aria-label', title); b.disabled=disabled; b.onclick=handler; return b;
    }
    function render() {
        for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t);
        el('type').value=settings.deviceType; el('mode').value=settings.mode; el('roles').value=settings.roles;
        el('direction').value=settings.direction; el('skip').checked=settings.skipUnavailable; el('title').checked=settings.showDeviceName;
        el('empty').hidden=settings.devices.length > 0; el('rows').replaceChildren();
        settings.devices.forEach((device, index) => {
            const row=document.createElement('div'); row.className='device';
            const num=document.createElement('span'); num.className='order'; num.textContent=index+1;
            const select=document.createElement('select'); select.setAttribute('aria-label',t('choose')+' '+(index+1));
            if (!devices.some(d=>d.id===device.id)) select.add(new Option('['+t('offline')+'] '+(device.name||device.id),device.id));
            for (const d of devices) { const option=new Option(d.name,d.id); option.disabled=settings.devices.some((other,j)=>j!==index&&other.id===d.id); select.add(option); }
            select.value=device.id;
            select.onchange=()=>{const found=devices.find(d=>d.id===select.value); if(found){settings.devices[index]={...device,id:found.id,name:found.name};save();render();}};
            const actions=document.createElement('div'); actions.className='actions';
            actions.append(button('↑',t('up'),index===0,()=>move(index,-1)),button('↓',t('down'),index===settings.devices.length-1,()=>move(index,1)),button('×',t('remove'),false,()=>{settings.devices.splice(index,1);save();render();}));
            const details=document.createElement('div'); details.className='details';
            const label=document.createElement('input'); label.value=device.label; label.placeholder=t('label'); label.maxLength=40;label.setAttribute('aria-label',t('label'));
            label.onchange=()=>{settings.devices[index].label=label.value;save();};
            const icon=document.createElement('select'); for(const kind of ['speakers','headphones','microphone'])icon.add(new Option(t(kind),kind));icon.value=device.icon;
            icon.onchange=()=>{settings.devices[index].icon=icon.value;save();};details.append(label,icon);row.append(num,select,actions,details);el('rows').append(row);
        });
        el('add').disabled=settings.devices.length>=S.MAX_DEVICES || !devices.some(d=>!settings.devices.some(c=>c.id===d.id));
    }
    function move(index, delta){const list=settings.devices;[list[index],list[index+delta]]=[list[index+delta],list[index]];save();render();}
    el('add').onclick=()=>{const device=devices.find(d=>!settings.devices.some(c=>c.id===d.id));if(device){settings.devices.push({id:device.id,name:device.name,label:'',icon:settings.deviceType==='input'?'microphone':'speakers'});save();render();}};
    el('refresh').onclick=request;
    el('type').onchange=()=>{
        const lists={...(settings.deviceLists||{}),[settings.deviceType]:settings.devices};
        settings=S.normalize({...settings,deviceType:el('type').value,devices:lists[el('type').value]||[],deviceLists:lists});
        devices=[];save();render();request();
    };
    for(const id of ['mode','roles','direction'])el(id).onchange=()=>{settings[id]=el(id).value;save();render();};
    el('skip').onchange=()=>{settings.skipUnavailable=el('skip').checked;save();};
    el('title').onchange=()=>{settings.showDeviceName=el('title').checked;save();};
    window.connectElgatoStreamDeckSocket=function(port,inspectorUUID,registerEvent,info,actionInfo){
        uuid=inspectorUUID;
        try{const parsed=JSON.parse(actionInfo);action=parsed.action;settings=S.normalize(parsed.payload?.settings);const lang=JSON.parse(info).application?.language||navigator.language||'en';language=lang.startsWith('ru')?'ru':lang.startsWith('zh')?'zh':'en';}
        catch(error){status(error.message,true);return;}
        render();socket=new WebSocket('ws://127.0.0.1:'+port);
        socket.onopen=()=>{socket.send(JSON.stringify({event:registerEvent,uuid}));request();};
        socket.onclose=()=>{clearTimeout(watchdog);status(t('disconnected'),true);};
        socket.onerror=()=>status(t('disconnected'),true);
        socket.onmessage=event=>{
            try{
                const data=JSON.parse(event.data),p=data.payload||{};
                if(data.event==='didReceiveSettings'){settings=S.normalize(p.settings);render();}
                else if(data.event==='sendToPropertyInspector'){
                    if(p.requestId!==undefined && (p.requestId!==requestId||p.deviceType!==settings.deviceType))return;
                    if(p.requestId!==undefined)clearTimeout(watchdog);
                    if(p.error){status(p.error,true);return;}
                    if(Array.isArray(p.devices)){devices=p.devices;render();status(devices.length?t('ready')+devices.length:t('none'));}
                }
            }catch(error){status(error.message,true);}
        };
    };
    render();
})();
