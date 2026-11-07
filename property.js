'use strict';
(() => {
    const S = window.AudioSettings, Catalog = window.AudioDeviceCatalog;
    const messages = {
        en: {type:'Device',output:'Output',input:'Input',mode:'Mode',cycle:'Cycle through the list',selected:'Select the first device',empty:'Add the devices in the desired switching order.',add:'+ Device',refresh:'Refresh',options:'Options',roles:'Change',all:'All default roles',media:'Playback / recording only',communications:'Communications only',direction:'Direction',next:'Forward',previous:'Backward',skip:'Skip disconnected devices',numbers:'Show number on key',iconChoice:'Icon',offline:'Disconnected',choose:'Choose device',label:'Name in this list',speakers_small:'Small speakers',speakers_large:'Large speakers',speakers_5_1:'5.1 speakers',speakers_7_1:'7.1 speakers',headphones:'Headphones',microphone:'Microphone',up:'Move up',down:'Move down',remove:'Remove',loading:'Reading Windows audio devices…',ready:'Devices found: ',timeout:'No reply from the plugin. Check that AudioSwitch.exe is included and restart StreamDock.',disconnected:'Connection to StreamDock closed.',none:'No active devices found. Connect a device and refresh.',changed:'Input and output lists are separate. The previous list is restored when changing back.'},
        ru: {type:'Устройство',output:'Выход',input:'Вход',mode:'Режим',cycle:'По кругу',selected:'Включить первое',empty:'Добавь устройства в нужном порядке переключения.',add:'+ Устройство',refresh:'Обновить',options:'Дополнительно',roles:'Менять',all:'Все роли Windows',media:'Только обычный звук',communications:'Только связь / звонки',direction:'Порядок',next:'Вперёд',previous:'Назад',skip:'Пропускать отключённые',numbers:'Показывать номер на кнопке',iconChoice:'Иконка',offline:'Отключено',choose:'Выбери устройство',label:'Название в списке',speakers_small:'Маленькие динамики',speakers_large:'Большие динамики',speakers_5_1:'Колонки 5.1',speakers_7_1:'Колонки 7.1',headphones:'Наушники',microphone:'Микрофон',up:'Выше',down:'Ниже',remove:'Убрать',loading:'Читаю аудиоустройства Windows…',ready:'Найдено устройств: ',timeout:'Нет ответа плагина. Проверь наличие AudioSwitch.exe и перезапусти StreamDock.',disconnected:'Связь со StreamDock закрыта.',none:'Нет активных устройств. Подключи устройство и обнови список.',changed:'Списки входов и выходов хранятся отдельно; прежний список восстановится при возврате.'},
        zh: {type:'设备',output:'输出',input:'输入',mode:'模式',cycle:'循环切换列表',selected:'选择第一个设备',empty:'按切换顺序添加设备。',add:'+ 设备',refresh:'刷新',options:'选项',roles:'更改',all:'所有默认角色',media:'仅播放 / 录音',communications:'仅通信',direction:'方向',next:'向前',previous:'向后',skip:'跳过已断开的设备',numbers:'显示按键编号',iconChoice:'图标',offline:'已断开',choose:'选择设备',label:'列表名称',speakers_small:'小型音箱',speakers_large:'大型音箱',speakers_5_1:'5.1 音箱',speakers_7_1:'7.1 音箱',headphones:'耳机',microphone:'麦克风',up:'上移',down:'下移',remove:'删除',loading:'正在读取音频设备…',ready:'找到设备：',timeout:'插件未响应。请检查 AudioSwitch.exe 并重启 StreamDock。',disconnected:'与 StreamDock 的连接已关闭。',none:'没有可用设备。连接后刷新。',changed:'输入和输出列表分别保存。'}
    };
    Object.assign(messages.en,{"highlight": "Highlight selected device", "badgeMode": "Number", "badgeAuto": "From list", "badgeCustom": "Custom number", "badgeOff": "Hidden", "customNumber": "Value", "highlightHint": "Highlight means: selected for the configured Windows roles, not currently playing sound.", "state_active": "Selected in Windows", "state_inactive": "Available, not selected", "state_partial": "Selected for some roles", "state_unavailable": "Device unavailable", "state_unknown": "State not confirmed", "state_unconfigured": "Choose a target device", "role_console": "Console", "role_multimedia": "Multimedia", "role_communications": "Calls", "matches": "Matching roles: ", "noMatches": "none", "stateHelp": "White frame = selected; dashed amber = partial; broken link = unavailable; ? = unknown."});
    Object.assign(messages.ru,{"highlight": "Подсвечивать активное устройство", "badgeMode": "Номер на кнопке", "badgeAuto": "Из списка", "badgeCustom": "Свой номер", "badgeOff": "Без номера", "customNumber": "Число", "highlightHint": "Подсветка означает выбор для заданных ролей Windows, а не наличие звука.", "state_active": "Выбрано в Windows", "state_inactive": "Доступно, не выбрано", "state_partial": "Выбрано для части ролей", "state_unavailable": "Устройство недоступно", "state_unknown": "Состояние не подтверждено", "state_unconfigured": "Выбери целевое устройство", "role_console": "Системный звук", "role_multimedia": "Мультимедиа", "role_communications": "Звонки", "matches": "Совпали роли: ", "noMatches": "нет", "stateHelp": "Светлая рамка — выбрано; пунктир — частично; разрыв — недоступно; ? — нет достоверных данных."});
    Object.assign(messages.zh,{"highlight": "高亮默认设备", "badgeMode": "按键编号", "badgeAuto": "列表顺序", "badgeCustom": "自定义编号", "badgeOff": "隐藏编号", "customNumber": "数字", "highlightHint": "高亮表示已设为所选 Windows 角色的默认设备，不表示正在播放声音。", "state_active": "已选为默认设备", "state_inactive": "可用但未选中", "state_partial": "部分角色已选中", "state_unavailable": "设备不可用", "state_unknown": "状态未确认", "state_unconfigured": "请选择目标设备", "role_console": "系统", "role_multimedia": "多媒体", "role_communications": "通信", "matches": "匹配的角色：", "noMatches": "无", "stateHelp": "白色边框：默认；虚线：部分；断链：不可用；问号：未知。"});
    let indicatorSequence = 0, indicatorTimer = null;
    let language = 'en', socket, uuid, action, settings = S.normalize({}), devices = [], requestId = 0, watchdog;
    const el = id => document.getElementById(id), t = key => messages[language][key];
    function status(text, error = false) { el('status').textContent = text; el('status').className = error ? 'error' : ''; }
    function send(event, payload) {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({event, context:uuid, action, payload}));
    }
    function save() { settings = S.normalize(settings); send('setSettings', settings); requestIndicator(); }
    function request() {
        clearTimeout(watchdog); requestId++; status(t('loading'));
        send('sendToPlugin', {requestDevices:true, deviceType:settings.deviceType, requestId});
        watchdog = setTimeout(() => status(t('timeout'), true), 10000);
    }
    function requestIndicator() {
        send('sendToPlugin',{requestIndicator:true,indicatorRequestId:++indicatorSequence,settings});
    }
    function showIndicator(payload) {
        if(payload.indicatorRequestId!==indicatorSequence)return;
        const indicator=payload.indicator;
        el('indicator-state').textContent=t('state_'+indicator.status)||t('state_unknown');
        const matches=Array.isArray(indicator.matches)?indicator.matches:[];
        el('indicator-roles').textContent=t('matches')+(matches.map(role=>t('role_'+role)||role).join(', ')||t('noMatches'));
        el('indicator-help').textContent=t('stateHelp');
        if(typeof payload.indicatorImage==='string' && payload.indicatorImage.startsWith('data:image/svg+xml;base64,'))el('key-preview').src=payload.indicatorImage;
    }
    function button(text, title, disabled, handler) {
        const b = document.createElement('button'); b.textContent=text; b.title=title; b.setAttribute('aria-label', title); b.disabled=disabled; b.onclick=handler; return b;
    }
    function render() {
        for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t);
        el('type').value=settings.deviceType; el('mode').value=settings.mode; el('roles').value=settings.roles;
        el('direction').value=settings.direction; el('skip').checked=settings.skipUnavailable; el('badge-mode').value=settings.badgeMode; el('custom-number').value=settings.customNumber;
        el('custom-option').hidden=settings.badgeMode!=='custom'; el('highlight').checked=settings.highlightActive;
        el('highlight').disabled=settings.mode!=='selected'; el('highlight-option').classList.toggle('disabled',settings.mode!=='selected');
        el('empty').hidden=settings.devices.length > 0; el('rows').replaceChildren();
        settings.devices.forEach((device, index) => {
            const row=document.createElement('div'); row.className='device';
            const num=document.createElement('span'); num.className='order'; num.textContent=index+1;
            const select=document.createElement('select'); select.setAttribute('aria-label',t('choose')+' '+(index+1));
            if (!devices.some(d=>d.id===device.id)) select.add(new Option('['+t('offline')+'] '+(device.name||device.id),device.id));
            for (const d of devices) { const option=new Option(d.name,d.id); option.disabled=settings.devices.some((other,j)=>j!==index&&other.id===d.id); select.add(option); }
            select.value=device.id;
            select.onchange=()=>{const found=devices.find(d=>d.id===select.value); if(found){settings.devices[index]={...settings.devices[index],id:found.id,name:found.name};save();render();}};
            const actions=document.createElement('div'); actions.className='actions';
            actions.append(button('↑',t('up'),index===0,()=>move(index,-1)),button('↓',t('down'),index===settings.devices.length-1,()=>move(index,1)),button('×',t('remove'),false,()=>{settings.devices.splice(index,1);save();render();}));
            const details=document.createElement('div'); details.className='details';
            const label=document.createElement('input'); label.value=device.label; label.placeholder=t('label'); label.maxLength=40;label.setAttribute('aria-label',t('label'));
            label.onchange=()=>{settings.devices[index].label=label.value;save();};
            const preview=document.createElement('span');preview.className='icon-preview';
            const image=document.createElement('img');image.alt='';
            const badge=document.createElement('span');badge.className='preview-number';badge.setAttribute('aria-hidden','true');
            preview.append(image,badge);
            function updatePreview(kind) {
                const entry=Catalog.get(kind);image.src='images/'+entry.asset+'.svg';
                badge.textContent=String(S.badgeFor(settings,index));badge.style.background=entry.color;badge.style.color='#101722';
                badge.classList.toggle('hidden',S.badgeFor(settings,index)===0);
            }
            const icon=document.createElement('select');icon.setAttribute('aria-label',t('iconChoice')+' '+(index+1));
            for(const entry of Catalog.forFlow(settings.deviceType))icon.add(new Option(entry.labels[language]||entry.labels.en,entry.id));
            icon.value=device.icon;updatePreview(device.icon);
            icon.onchange=()=>{settings.devices[index].icon=icon.value;updatePreview(icon.value);save();};
            const picker=document.createElement('label');picker.append(preview,icon);
            details.append(picker,label);row.append(num,select,actions,details);el('rows').append(row);
        });
        el('add').disabled=settings.devices.length>=S.MAX_DEVICES || !devices.some(d=>!settings.devices.some(c=>c.id===d.id));
    }
    function move(index, delta){const list=settings.devices;[list[index],list[index+delta]]=[list[index+delta],list[index]];save();render();}
    el('add').onclick=()=>{const device=devices.find(d=>!settings.devices.some(c=>c.id===d.id));if(device){settings.devices.push({id:device.id,name:device.name,label:'',icon:settings.deviceType==='input'?'microphone':'speakers_small'});save();render();}};
    el('refresh').onclick=request;
    el('type').onchange=()=>{
        const lists={...(settings.deviceLists||{}),[settings.deviceType]:settings.devices};
        settings=S.normalize({...settings,deviceType:el('type').value,devices:lists[el('type').value]||[],deviceLists:lists});
        devices=[];save();render();request();
    };
    for(const id of ['mode','roles','direction'])el(id).onchange=()=>{settings[id]=el(id).value;save();render();};
    el('skip').onchange=()=>{settings.skipUnavailable=el('skip').checked;save();};
    el('badge-mode').onchange=()=>{settings.badgeMode=el('badge-mode').value;save();render();};
    el('custom-number').onchange=()=>{settings.customNumber=el('custom-number').value;save();render();};
    el('highlight').onchange=()=>{settings.highlightActive=el('highlight').checked;save();};
    window.connectElgatoStreamDeckSocket=function(port,inspectorUUID,registerEvent,info,actionInfo){
        uuid=inspectorUUID;
        try{const parsed=JSON.parse(actionInfo);action=parsed.action;settings=S.normalize(parsed.payload?.settings);const lang=JSON.parse(info).application?.language||navigator.language||'en';language=lang.startsWith('ru')?'ru':lang.startsWith('zh')?'zh':'en';}
        catch(error){status(error.message,true);return;}
        render();socket=new WebSocket('ws://127.0.0.1:'+port);
        socket.onopen=()=>{socket.send(JSON.stringify({event:registerEvent,uuid}));request();requestIndicator();clearInterval(indicatorTimer);indicatorTimer=setInterval(requestIndicator,2000);};
        socket.onclose=()=>{clearTimeout(watchdog);clearInterval(indicatorTimer);el('indicator-state').textContent=t('state_unknown');status(t('disconnected'),true);};
        socket.onerror=()=>status(t('disconnected'),true);
        window.addEventListener('pagehide',()=>clearInterval(indicatorTimer),{once:true});
        socket.onmessage=event=>{
            try{
                const data=JSON.parse(event.data),p=data.payload||{};
                if(data.event==='didReceiveSettings'){settings=S.normalize(p.settings);render();requestIndicator();}
                else if(data.event==='sendToPropertyInspector'){
                    if(p.indicator){showIndicator(p);return;}
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
