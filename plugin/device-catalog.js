/* Shared icon catalog. No platform APIs; works in the host and inspector. */
(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AudioDeviceCatalog = factory();
}(typeof globalThis === 'object' ? globalThis : this, function() {
    'use strict';
    const entries = [
    {
        "id": "speakers_small",
        "asset": "device1",
        "color": "#4fc3f7",
        "labels": {
            "ru": "Маленькие динамики",
            "en": "Small speakers",
            "zh": "小型音箱"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "speakers_large",
        "asset": "device2",
        "color": "#ba68c8",
        "labels": {
            "ru": "Большие динамики",
            "en": "Large speakers",
            "zh": "大型音箱"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "headphones",
        "asset": "device3",
        "color": "#ffbe58",
        "labels": {
            "ru": "Наушники",
            "en": "Headphones",
            "zh": "耳机"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "speakers_2_1",
        "asset": "device_2_1",
        "color": "#e3d867",
        "labels": {
            "ru": "Колонки 2.1",
            "en": "2.1 speakers",
            "zh": "2.1 音箱"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "speakers_5_1",
        "asset": "device4",
        "color": "#68d887",
        "labels": {
            "ru": "Колонки 5.1",
            "en": "5.1 speakers",
            "zh": "5.1 音箱"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "speakers_7_1",
        "asset": "device5",
        "color": "#ff855b",
        "labels": {
            "ru": "Колонки 7.1",
            "en": "7.1 speakers",
            "zh": "7.1 音箱"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "soundbar",
        "asset": "device_soundbar",
        "color": "#5ad9bb",
        "labels": {
            "ru": "Саундбар",
            "en": "Soundbar",
            "zh": "条形音箱"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "monitor",
        "asset": "device_monitor",
        "color": "#819aff",
        "labels": {
            "ru": "Монитор с динамиками",
            "en": "Monitor audio",
            "zh": "显示器音频"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "television",
        "asset": "device_tv",
        "color": "#b9d765",
        "labels": {
            "ru": "Телевизор / HDMI",
            "en": "TV / HDMI audio",
            "zh": "电视 / HDMI 音频"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "bluetooth_speaker",
        "asset": "device_bt_speaker",
        "color": "#69d7df",
        "labels": {
            "ru": "Bluetooth-колонка",
            "en": "Bluetooth speaker",
            "zh": "蓝牙音箱"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "bluetooth_headphones",
        "asset": "device_bt_headphones",
        "color": "#d779e9",
        "labels": {
            "ru": "Bluetooth-наушники",
            "en": "Bluetooth headphones",
            "zh": "蓝牙耳机"
        },
        "flows": [
            "output",
            "input"
        ]
    },
    {
        "id": "usb_headset",
        "asset": "device_usb_headset",
        "color": "#f38caf",
        "labels": {
            "ru": "USB-гарнитура",
            "en": "USB headset",
            "zh": "USB 耳麦"
        },
        "flows": [
            "output",
            "input"
        ]
    },
    {
        "id": "dac",
        "asset": "device_dac",
        "color": "#aca1e8",
        "labels": {
            "ru": "ЦАП / усилитель",
            "en": "DAC / amplifier",
            "zh": "DAC / 耳放"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "audio_interface",
        "asset": "device_interface",
        "color": "#d4a17c",
        "labels": {
            "ru": "Аудиоинтерфейс",
            "en": "Audio interface",
            "zh": "音频接口"
        },
        "flows": [
            "output",
            "input"
        ]
    },
    {
        "id": "av_receiver",
        "asset": "device_receiver",
        "color": "#84b5d1",
        "labels": {
            "ru": "AV-ресивер",
            "en": "AV receiver",
            "zh": "AV 功放"
        },
        "flows": [
            "output"
        ]
    },
    {
        "id": "microphone",
        "asset": "device_microphone",
        "color": "#e6c893",
        "labels": {
            "ru": "Микрофон",
            "en": "Microphone",
            "zh": "麦克风"
        },
        "flows": [
            "input",
            "output"
        ]
    },
    {
        "id": "line_in",
        "asset": "device_line_in",
        "color": "#83be9c",
        "labels": {
            "ru": "Линейный вход / AUX",
            "en": "Line input / AUX",
            "zh": "线路输入 / AUX"
        },
        "flows": [
            "input"
        ]
    },
    {
        "id": "virtual_audio",
        "asset": "device_virtual",
        "color": "#bac5d9",
        "labels": {
            "ru": "Виртуальный кабель",
            "en": "Virtual audio cable",
            "zh": "虚拟音频线"
        },
        "flows": [
            "output",
            "input"
        ]
    }
];
    const byId = new Map(entries.map(entry => [entry.id, Object.freeze(entry)]));
    function normalizeKind(kind, flow = 'output') {
        if (kind === 'speakers') kind = 'speakers_small';
        const entry = byId.get(kind);
        return entry && entry.flows.includes(flow) ? kind : flow === 'input' ? 'microphone' : 'speakers_small';
    }
    return {entries: Object.freeze(entries), get: kind => byId.get(kind),
        forFlow: flow => entries.filter(entry => entry.flows.includes(flow)), normalizeKind};
}));
