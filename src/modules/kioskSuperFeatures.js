// Mini Health Station SaaS — Complete Original Features Engine
// Includes: Web Bluetooth (5 devices + Auto-hunt BP), Thai TTS, Smartcard Auto-Poll (8189 + NHSO Authen),
// Patient Photo Fetch/Camera Upload, AI Nurse Auto-Analysis, Emergency Critical BP Red Modal,
// Child Nutrition Auto-Calc (0-60m), DTX Fasting Popup, SpecialPP Payload Enricher,
// VHV Online Heartbeat + 10-min Idle Timeout, Telemedicine, Admin VHV Drill-down, BP Follow-up & Research Charts.

const NUTRITION_DICT = {
  nlevel: { '1': 'น้ำหนักมาก', '2': 'น้ำหนักค่อนข้างมาก', '3': 'นน.ตามเกณฑ์', '4': 'น้ำหนักค่อนข้างน้อย', '5': 'น้ำหนักน้อย', '99': 'นน.สูงเกิน แปลผลไม่ได้' },
  nlevel2: { '1': 'สูง', '2': 'ค่อนข้างสูง', '3': 'สูงตามเกณฑ์', '4': 'ค่อนข้างเตี้ย', '5': 'เตี้ย', '99': 'สูงตามเกณฑ์' },
  nlevel3: { '1': 'อ้วน', '2': 'เริ่มอ้วน', '3': 'ท้วม', '4': 'สมส่วน', '5': 'ค่อนข้างผอม', '6': 'ผอม', '99': 'สมส่วน' }
};

const state = {
  apiUrl: '',
  apiSecret: '',
  hospcode: '',
  hospName: '',
  lastPatient: null,
  lastVhvStats: [],
  lastBpData: [],
  lastAnalytics: null,
  selectedBpIdx: -1,
  referStatus: '',
  guideAction: null,
  currentAudio: null,
  audioCache: {},
  aiTimer: null,
  idleTimer: null,
  isPollingCard: false,
  isHuntingBp: false,
  secretClicks: 0,
  secretClickTimer: null,
  pendingCidLookup: null,
  pendingLookupTimer: null,
  modeButtons: { staff: null, vhv: null, admin: null },
  cloudBaseUrl: 'https://mini-health-saas-cloud.sirapop-nick.workers.dev',
  licenseKey: '',
  devices: {
    bp: localStorage.getItem('dev_bp') || '',
    o2: localStorage.getItem('dev_o2') || '',
    weight: localStorage.getItem('dev_weight') || '',
    temp: localStorage.getItem('dev_temp') || '',
    sugar: localStorage.getItem('dev_sugar') || ''
  }
};

function scanConnectorFromStorage() {
  if (state.apiUrl && state.apiSecret) return { apiUrl: state.apiUrl, apiSecret: state.apiSecret };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || raw[0] !== '{') continue;
      try {
        const obj = JSON.parse(raw);
        const t = obj.tenant || obj;
        if (t && t.api_url && t.api_secret) {
          state.apiUrl = String(t.api_url).replace(/\/+$/, '');
          state.apiSecret = String(t.api_secret);
          if (t.hospcode) state.hospcode = String(t.hospcode);
          if (t.hosp_name) state.hospName = String(t.hosp_name);
          if (t.license_key) state.licenseKey = String(t.license_key);
          if (obj.cloudBaseUrl || t.cloud_base_url) state.cloudBaseUrl = String(obj.cloudBaseUrl || t.cloud_base_url).replace(/\/+$/, '');
          return { apiUrl: state.apiUrl, apiSecret: state.apiSecret };
        }
      } catch (e) {}
    }
  } catch (e) {}
  return { apiUrl: state.apiUrl, apiSecret: state.apiSecret };
}

function getConnectorHeaders() {
  const c = scanConnectorFromStorage();
  const h = { 'Content-Type': 'application/json' };
  if (c.apiSecret) h['x-api-key'] = c.apiSecret;
  return h;
}

// ==================== 1. TTS ENGINE ====================
function b64toBlob(b64, contentType) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: contentType || 'audio/mp3' });
}

async function speak(text) {
  if (!text) return;
  if (state.currentAudio) {
    try { state.currentAudio.pause(); } catch (e) {}
    state.currentAudio = null;
  }
  const c = scanConnectorFromStorage();
  if (c.apiUrl) {
    try {
      let url = state.audioCache[text];
      if (!url) {
        const res = await window.__mhsOrigFetch(c.apiUrl + '/jhcis-api/tts', {
          method: 'POST',
          headers: getConnectorHeaders(),
          body: JSON.stringify({ text: text })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.audioContent) {
            url = URL.createObjectURL(b64toBlob(data.audioContent, 'audio/mp3'));
            state.audioCache[text] = url;
          }
        }
      }
      if (url) {
        const audio = new Audio(url);
        audio.playbackRate = 1.15;
        state.currentAudio = audio;
        audio.play().catch(function () {});
        return;
      }
    } catch (e) {}
  }
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'th-TH';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    }
  } catch (e) {}
}

// ==================== 2. WEB BLUETOOTH (5 DEVICES + AUTO-HUNT BP) ====================
function setVitalField(kioskId, staffId, val) {
  [kioskId, staffId].forEach(function (id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

function updateDeviceState(key, name) {
  state.devices[key] = name || '';
  localStorage.setItem('dev_' + key, state.devices[key]);
  refreshBluetoothUI();
}

function refreshBluetoothUI() {
  const pairedCount = Object.values(state.devices).filter(Boolean).length;
  const fab = document.getElementById('mhsBtFabText');
  if (fab) fab.textContent = pairedCount > 0 ? ('Bluetooth (' + pairedCount + ')') : 'Bluetooth';
  ['bp', 'o2', 'weight', 'temp', 'sugar'].forEach(function (k) {
    document.querySelectorAll('[data-bt-dot="' + k + '"]').forEach(function (dot) {
      dot.classList.toggle('paired', Boolean(state.devices[k]));
    });
    const st = document.getElementById('mhsBtStatus_' + k);
    if (st) {
      st.textContent = state.devices[k] ? ('เชื่อมต่อแล้ว: ' + state.devices[k]) : 'ยังไม่ได้จับคู่อุปกรณ์';
      st.style.color = state.devices[k] ? '#059669' : '#94A3B8';
    }
    const cb = document.getElementById('mhsBtToggle_' + k);
    if (cb) cb.checked = Boolean(state.devices[k]);
  });
}

function parseBPData(dataView) {
  let offset = 0;
  const flags = dataView.getUint8(offset++);
  const isKpa = (flags & 0x01) !== 0;
  const hasTimestamp = (flags & 0x02) !== 0;
  const hasPulseRate = (flags & 0x04) !== 0;
  function readSfloat(view, pos) {
    const raw = view.getUint16(pos, true);
    const mantissa = raw & 0x0FFF;
    let exponent = raw >> 12;
    if (exponent >= 8) exponent = -((~exponent & 0x0F) + 1);
    return mantissa * Math.pow(10, exponent);
  }
  const sys = readSfloat(dataView, offset); offset += 2;
  const dia = readSfloat(dataView, offset); offset += 2;
  offset += 2;
  if (hasTimestamp) offset += 7;
  let pulse = 0;
  if (hasPulseRate) { pulse = readSfloat(dataView, offset); offset += 2; }
  return { sys: sys, dia: dia, pulse: pulse, isKpa: isKpa };
}

async function connectBluetoothBP() {
  if (!navigator.bluetooth) { alert('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth (แนะนำ Google Chrome / Edge)'); return; }
  try {
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['blood_pressure'] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('blood_pressure');
    const ch = await service.getCharacteristic('blood_pressure_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', function (ev) {
      const bp = parseBPData(new DataView(ev.target.value.buffer));
      const sys = bp.isKpa ? (bp.sys * 7.50062).toFixed(0) : bp.sys.toFixed(0);
      const dia = bp.isKpa ? (bp.dia * 7.50062).toFixed(0) : bp.dia.toFixed(0);
      const pulse = bp.pulse.toFixed(0);
      setVitalField('kioskPressure', 'stPressure', sys + '/' + dia);
      if (Number(pulse) > 0) setVitalField('kioskPulse', 'stPulse', pulse);
      speak('วัดความดันเสร็จสิ้น ความดันโลหิต ' + sys + ' ตัวล่าง ' + dia + ' ชีพจร ' + pulse + ' ครั้งต่อนาทีค่ะ');
    });
    updateDeviceState('bp', device.name || 'YUWELL BP');
    alert('✅ จับคู่เครื่องวัดความดันสำเร็จ (' + (device.name || 'YUWELL BP') + ')');
  } catch (err) {
    console.warn('BLE BP:', err);
  }
}

async function connectBluetoothO2() {
  if (!navigator.bluetooth) { alert('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth'); return; }
  try {
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['pulse_oximeter'] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('pulse_oximeter');
    const ch = await service.getCharacteristic('plx_continuous_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', function (ev) {
      const v = ev.target.value;
      setVitalField('kioskSpo2', null, String(v.getUint8(1)));
      setVitalField('kioskPulse', 'stPulse', String(v.getUint8(3)));
    });
    updateDeviceState('o2', device.name || 'Yuwell Oximeter');
    alert('✅ เชื่อมต่อเครื่องวัดออกซิเจนปลายนิ้วสำเร็จ');
  } catch (err) {
    console.warn('BLE O2:', err);
  }
}

async function connectBluetoothWeight() {
  if (!navigator.bluetooth) { alert('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth'); return; }
  let hb = null;
  try {
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [0xA602] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(0xA602);
    const chars = await service.getCharacteristics();
    const writePipe = chars.find(function (c) { return c.properties.write || c.properties.writeWithoutResponse; });
    const notifyPipes = chars.filter(function (c) { return c.properties.notify || c.properties.indicate; });

    async function writeBytes(bytes) {
      if (!writePipe) return;
      try {
        if (writePipe.properties.writeWithoutResponse) await writePipe.writeValueWithoutResponse(bytes);
        else await writePipe.writeValue(bytes);
      } catch (e) {}
    }

    async function injectProfile() {
      await writeBytes(new Uint8Array([0xFE, 0x01, 0x01, 0x1E, 0xAA, 0x3E, 0x00, 0x00]));
    }

    function processData(raw) {
      const hex = Array.from(raw).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' ');
      if (hex.indexOf('00 00 00 00 00 00 00 00') >= 0 || hex.indexOf('10 0a 00 07 00 00') >= 0) return;
      if (raw.length >= 3 && raw[0] === 0x00 && raw[1] === 0x01) { injectProfile(); return; }
      let w = 0;
      if (raw.length >= 12 && raw[0] === 0x10) {
        if (raw[1] === 0x11 || raw.length >= 19) w = ((raw[10] << 8) | raw[11]) * 0.01;
        else if (raw[1] === 0x0a) w = ((raw[4] << 8) | raw[5]) * 0.01;
      }
      if (w > 5 && w < 300) setVitalField('kioskWeight', 'stWeight', w.toFixed(2));
    }

    for (let i = 0; i < notifyPipes.length; i++) {
      try {
        await notifyPipes[i].startNotifications();
        notifyPipes[i].addEventListener('characteristicvaluechanged', function (e) {
          processData(new Uint8Array(e.target.value.buffer));
        });
      } catch (e) {}
    }

    await writeBytes(new Uint8Array([0xFD, 0x37]));
    await writeBytes(new Uint8Array([0x01, 0x00]));
    await injectProfile();

    hb = setInterval(function () { writeBytes(new Uint8Array([0x00])); }, 1000);
    device.addEventListener('gattserverdisconnected', function () { if (hb) clearInterval(hb); });
    updateDeviceState('weight', device.name || 'ALLWELL Scale');
    alert('✅ เชื่อมต่อเครื่องชั่งน้ำหนักสำเร็จ');
  } catch (err) {
    if (hb) clearInterval(hb);
    console.warn('BLE Weight:', err);
  }
}

async function connectBluetoothTemp() {
  if (!navigator.bluetooth) { alert('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth'); return; }
  try {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Yuwell HT' }], optionalServices: ['health_thermometer'] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('health_thermometer');
    const ch = await service.getCharacteristic('temperature_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', function (ev) {
      const v = ev.target.value;
      const mantissa = v.getUint8(1) | (v.getUint8(2) << 8) | (v.getUint8(3) << 16);
      const exp = v.getInt8(4);
      setVitalField('kioskTemp', 'stTemp', (mantissa * Math.pow(10, exp)).toFixed(1));
    });
    updateDeviceState('temp', device.name || 'Yuwell Temp');
    alert('✅ เชื่อมต่อเครื่องวัดอุณหภูมิสำเร็จ');
  } catch (err) {
    console.warn('BLE Temp:', err);
  }
}

async function connectBluetoothSugar() {
  if (!navigator.bluetooth) { alert('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth'); return; }
  try {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Yuwell Glucose' }], optionalServices: ['glucose'] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('glucose');
    const ch = await service.getCharacteristic('glucose_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', function (ev) {
      setVitalField('kioskSugar', 'stSugar', String(ev.target.value.getUint16(10, true)));
    });
    updateDeviceState('sugar', device.name || 'Yuwell Glucose');
    alert('✅ เชื่อมต่อเครื่องวัดน้ำตาลสำเร็จ');
  } catch (err) {
    console.warn('BLE Sugar:', err);
  }
}

async function huntForPairedBP() {
  if (state.isHuntingBp) return;
  if (!document.getElementById('kioskPressure') && !document.getElementById('stPressure')) return;
  if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return;
  try {
    const list = await navigator.bluetooth.getDevices();
    const bpDev = list.find(function (d) { return d.name && d.name.indexOf('YUWELL') >= 0; });
    if (!bpDev || (bpDev.gatt && bpDev.gatt.connected)) return;
    state.isHuntingBp = true;
    const server = await bpDev.gatt.connect();
    const service = await server.getPrimaryService('blood_pressure');
    const ch = await service.getCharacteristic('blood_pressure_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', function (ev) {
      const bp = parseBPData(new DataView(ev.target.value.buffer));
      const sys = bp.isKpa ? (bp.sys * 7.50062).toFixed(0) : bp.sys.toFixed(0);
      const dia = bp.isKpa ? (bp.dia * 7.50062).toFixed(0) : bp.dia.toFixed(0);
      const pulse = bp.pulse.toFixed(0);
      setVitalField('kioskPressure', 'stPressure', sys + '/' + dia);
      if (Number(pulse) > 0) setVitalField('kioskPulse', 'stPulse', pulse);
      speak('วัดความดันเสร็จสิ้น ความดันโลหิต ' + sys + ' ตัวล่าง ' + dia + ' ชีพจร ' + pulse + ' ครั้งต่อนาทีค่ะ');
    });
    bpDev.addEventListener('gattserverdisconnected', function () { state.isHuntingBp = false; }, { once: true });
  } catch (e) {
    state.isHuntingBp = false;
  }
}

// ==================== 3. PATIENT PHOTO FETCH & CAMERA UPLOAD ====================
async function fetchPatientPhoto(cid) {
  if (!cid || String(cid).length !== 13) return;
  const c = scanConnectorFromStorage();
  if (!c.apiUrl) return;
  try {
    const res = await window.__mhsOrigFetch(c.apiUrl + '/jhcis-api/photo/' + cid + '?t=' + Date.now(), {
      headers: getConnectorHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.image) {
        applyPatientPhoto('data:image/jpeg;base64,' + data.image);
        return;
      }
    }
  } catch (e) {}
  applyPatientPhoto(null);
}

function applyPatientPhoto(dataUrl) {
  [['kioskAvatarImg', 'kioskAvatarPlaceholder'], ['staffAvatarImg', 'staffAvatarPlaceholder']].forEach(function (pair) {
    const img = document.getElementById(pair[0]);
    const ph = document.getElementById(pair[1]);
    if (!img || !ph) return;
    if (dataUrl) {
      img.src = dataUrl;
      img.style.display = 'block';
      ph.style.display = 'none';
    } else {
      img.style.display = 'none';
      ph.style.display = 'flex';
    }
  });
}

function handleCameraCapture(file) {
  if (!file) return;
  const cid = (document.getElementById('kioskCid') && document.getElementById('kioskCid').value.trim()) ||
              (document.getElementById('staffCidInput') && document.getElementById('staffCidInput').value.trim()) ||
              (state.lastPatient && state.lastPatient.cid) || '';
  if (!cid) { alert('กรุณาค้นหาหรือเลือกผู้ป่วยก่อนถ่ายรูปครับ'); return; }
  const reader = new FileReader();
  reader.onloadend = function () {
    const img = new Image();
    img.src = reader.result;
    img.onload = async function () {
      const canvas = document.createElement('canvas');
      const maxW = 600;
      const scale = maxW / img.width;
      canvas.width = maxW;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', 0.7);
      applyPatientPhoto(b64);
      const c = scanConnectorFromStorage();
      if (!c.apiUrl) return;
      try {
        const res = await window.__mhsOrigFetch(c.apiUrl + '/jhcis-api/upload-photo', {
          method: 'POST',
          headers: getConnectorHeaders(),
          body: JSON.stringify({ cid: cid, image: b64 })
        });
        const data = await res.json();
        alert(data && data.success ? '📸 บันทึกรูปภาพผู้ป่วยลง JHCIS สำเร็จ!' : '❌ บันทึกรูปไม่สำเร็จ');
      } catch (err) {
        alert('❌ อัปโหลดรูปไม่สำเร็จ: ' + err.message);
      }
    };
  };
  reader.readAsDataURL(file);
}

// ==================== 4. LIVE VITALS, BMI, CHILD MODE, EMERGENCY & AI NURSE ====================
function updateChildModeUI() {
  const ageEl = document.getElementById('kioskAgeMonths');
  const svcEl = document.getElementById('kioskServiceType');
  const childBox = document.getElementById('mhsChildNutritionBox');
  const childTag = document.getElementById('kioskChildModeTag');
  if (!ageEl || !childBox) return;

  const ageVal = ageEl.value !== '' ? Number(ageEl.value) : NaN;
  const isChild = (svcEl && svcEl.value === 'child') || (!isNaN(ageVal) && ageVal >= 0 && ageVal <= 60);

  childBox.style.display = isChild ? 'block' : 'none';
  if (childTag) childTag.style.display = isChild ? 'inline-flex' : 'none';
  document.querySelectorAll('.mhs-adult-only').forEach(function (el) {
    el.style.display = isChild ? 'none' : '';
  });

  if (isChild) {
    const w = parseFloat(document.getElementById('kioskWeight') ? document.getElementById('kioskWeight').value : '');
    const h = parseFloat(document.getElementById('kioskHeight') ? document.getElementById('kioskHeight').value : '');
    const age = isNaN(ageVal) ? 24 : ageVal;
    if (w > 0 && h > 0) {
      let n1 = '3', n2 = '3', n3 = '4';
      if (w >= 35 || h >= 130 || w <= 2 || h <= 40) {
        n1 = '99'; n2 = '99'; n3 = '99';
      } else {
        const bmi = w / Math.pow(h / 100, 2);
        if (bmi > 18.5) n3 = '1'; else if (bmi > 17.5) n3 = '2'; else if (bmi > 16.5) n3 = '3';
        else if (bmi < 13.5) n3 = '6'; else if (bmi < 14.5) n3 = '5';
        const avgW = (age * 0.25) + 3;
        if (w > avgW * 1.3) n1 = '1'; else if (w > avgW * 1.15) n1 = '2'; else if (w < avgW * 0.7) n1 = '5'; else if (w < avgW * 0.85) n1 = '4';
        const avgH = (age * 0.8) + 50;
        if (h > avgH * 1.1) n2 = '1'; else if (h > avgH * 1.05) n2 = '2'; else if (h < avgH * 0.9) n2 = '5'; else if (h < avgH * 0.95) n2 = '4';
      }
      const setVal = function (id, v) { const x = document.getElementById(id); if (x) x.value = v; };
      setVal('kioskNlevel', n1);
      setVal('kioskNlevel2', n2);
      setVal('kioskNlevel3', n3);
      setVal('kioskNlevelText', (NUTRITION_DICT.nlevel[n1] || n1) + ' (' + n1 + ')');
      setVal('kioskNlevel2Text', (NUTRITION_DICT.nlevel2[n2] || n2) + ' (' + n2 + ')');
      setVal('kioskNlevel3Text', (NUTRITION_DICT.nlevel3[n3] || n3) + ' (' + n3 + ')');
    }
  }
}

function evaluateKioskHealth() {
  const w = parseFloat(document.getElementById('kioskWeight') ? document.getElementById('kioskWeight').value : '');
  const h = parseFloat(document.getElementById('kioskHeight') ? document.getElementById('kioskHeight').value : '');
  const bp = (document.getElementById('kioskPressure') ? document.getElementById('kioskPressure').value : '').trim();
  const sugar = (document.getElementById('kioskSugar') ? document.getElementById('kioskSugar').value : '').trim();
  const bmiEl = document.getElementById('kioskBmiLive');

  let bmiStr = '---';
  if (w > 0 && h > 0) bmiStr = (w / Math.pow(h / 100, 2)).toFixed(2);
  if (bmiEl) bmiEl.textContent = bmiStr === '---' ? 'BMI --' : ('BMI ' + bmiStr);

  // Staff BMI live badge
  const sw = parseFloat(document.getElementById('stWeight') ? document.getElementById('stWeight').value : '');
  const sh = parseFloat(document.getElementById('stHeight') ? document.getElementById('stHeight').value : '');
  const sbmi = document.getElementById('staffBmiLive');
  if (sbmi) sbmi.textContent = (sw > 0 && sh > 0) ? ('BMI ' + (sw / Math.pow(sh / 100, 2)).toFixed(2)) : 'BMI --';

  updateChildModeUI();

  const alertsBox = document.getElementById('kioskHealthAlerts');
  if (!alertsBox) return;
  const alerts = [];
  let isEmergency = false;

  if (bmiStr !== '---') {
    const b = Number(bmiStr);
    if (b >= 30) alerts.push({ icon: 'fa-triangle-exclamation', title: 'โรคอ้วนระดับ 2 (BMI: ' + bmiStr + ')', desc: 'เสี่ยงโรคแทรกซ้อนสูง ควรพบแพทย์และปรับพฤติกรรม', color: '#DC2626' });
    else if (b >= 25) alerts.push({ icon: 'fa-circle-exclamation', title: 'โรคอ้วนระดับ 1 (BMI: ' + bmiStr + ')', desc: 'ควรเริ่มควบคุมอาหารและออกกำลังกาย', color: '#EA580C' });
    else if (b >= 23) alerts.push({ icon: 'fa-bell', title: 'น้ำหนักเกิน (BMI: ' + bmiStr + ')', desc: 'ควรระวังเรื่องอาหารการกิน', color: '#CA8A04' });
    else if (b >= 18.5) alerts.push({ icon: 'fa-circle-check', title: 'น้ำหนักปกติ (BMI: ' + bmiStr + ')', desc: 'รักษาสุขภาพได้ดีมากครับ', color: '#16A34A' });
    else alerts.push({ icon: 'fa-circle-info', title: 'น้ำหนักต่ำกว่าเกณฑ์ (BMI: ' + bmiStr + ')', desc: 'ควรรับประทานอาหารที่มีประโยชน์เพิ่มขึ้น', color: '#2563EB' });
  }

  if (bp && bp.indexOf('/') > 0) {
    const parts = bp.split('/').map(Number);
    const sys = parts[0], dia = parts[1];
    if (sys > 0 && dia > 0) {
      if (sys >= 180 || dia >= 120) {
        isEmergency = true;
        alerts.push({ icon: 'fa-heart-crack', title: 'ความดันโลหิตสูงวิกฤต! (' + bp + ')', desc: 'อันตราย! เสี่ยงหลอดเลือดสมองแตก กรุณานั่งพัก แจ้งเจ้าหน้าที่ทันที หรือโทร 1669', color: '#DC2626' });
        const emModal = document.getElementById('mhsEmergencyModal');
        const emVal = document.getElementById('mhsEmergencyBpVal');
        if (emVal) emVal.textContent = bp;
        if (emModal && !emModal.classList.contains('open')) {
          emModal.classList.add('open');
          speak('อันตราย ความดันโลหิตของคุณสูงถึงขั้นวิกฤต กรุณานั่งพัก และแจ้งเจ้าหน้าที่ทันทีค่ะ');
        }
      } else if (sys >= 140 || dia >= 90) {
        alerts.push({ icon: 'fa-heart-circle-exclamation', title: 'ความดันโลหิตสูง (' + bp + ')', desc: 'ควรพบแพทย์เพื่อประเมินอาการอย่างละเอียด', color: '#EA580C' });
      } else if (sys <= 90 || dia <= 60) {
        alerts.push({ icon: 'fa-heart-circle-minus', title: 'ความดันโลหิตต่ำ (' + bp + ')', desc: 'อาจมีอาการหน้ามืด วิงเวียน ควรพักผ่อนและดื่มน้ำให้เพียงพอ', color: '#2563EB' });
      } else {
        alerts.push({ icon: 'fa-heart-circle-check', title: 'ความดันโลหิตปกติ (' + bp + ')', desc: 'อยู่ในเกณฑ์ที่ดีครับ', color: '#16A34A' });
      }
    }
  }

  alertsBox.innerHTML = (isEmergency
    ? '<a href="tel:1669" class="btn btn-danger" style="width:100%;padding:14px;font-size:18px;text-decoration:none;margin-bottom:10px;"><i class="fa-solid fa-truck-medical"></i> โทรเรียก 1669 ทันที!</a>'
    : '') + alerts.map(function (a) {
    return '<div class="mhs-alert-card" style="background:' + a.color + '15;">' +
      '<i class="fa-solid ' + a.icon + '" style="font-size:24px;color:' + a.color + ';margin-top:2px;"></i>' +
      '<div><h4 style="color:' + a.color + ';">' + a.title + '</h4><p>' + a.desc + '</p></div></div>';
  }).join('');

  // Debounced AI Nurse
  if (bp || w > 0 || sugar) {
    if (state.aiTimer) clearTimeout(state.aiTimer);
    state.aiTimer = setTimeout(async function () {
      const c = scanConnectorFromStorage();
      const card = document.getElementById('kioskAiCard');
      const txt = document.getElementById('kioskAiText');
      const ico = document.getElementById('kioskAiIcon');
      if (!c.apiUrl || !card || !txt) return;
      card.style.display = 'flex';
      if (ico) ico.className = 'fa-solid fa-spinner fa-spin';
      txt.textContent = 'กำลังวิเคราะห์ข้อมูลสุขภาพอย่างละเอียด...';
      try {
        const res = await window.__mhsOrigFetch(c.apiUrl + '/jhcis-api/ai-analyze', {
          method: 'POST',
          headers: getConnectorHeaders(),
          body: JSON.stringify({ vitals: { sysDia: bp || '---', weight: w ? String(w) : '---', height: h ? String(h) : '---', bmi: bmiStr, sugar: sugar || '---' } })
        });
        const data = await res.json();
        if (ico) ico.className = 'fa-solid fa-user-doctor';
        txt.textContent = (data && data.message) ? data.message : 'ประเมินผลเบื้องต้นเสร็จสิ้น';
        if (data && data.message) speak(data.message);
      } catch (e) {
        if (ico) ico.className = 'fa-solid fa-user-doctor';
        txt.textContent = 'ไม่สามารถเชื่อมต่อระบบ AI ได้ในขณะนี้';
      }
    }, 2000);
  }
}

// ==================== 5. SMARTCARD AUTO-POLL (8189) + NHSO AUTHEN ====================
async function pollSmartcardStandby() {
  const standby = document.getElementById('mhsKioskStandby');
  if (!standby || standby.style.display === 'none' || state.isPollingCard) return;
  if (document.querySelector('.mhs-modal-bg.open')) return;
  state.isPollingCard = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 2200);
    const res = await window.__mhsOrigFetch('http://localhost:8189/api/smartcard/read?readImageFlag=true', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const card = await res.json();
      const cid = card && (card.pid || card.citizenId);
      if (cid && String(cid).length === 13) {
        const inp = document.getElementById('kioskCid');
        if (inp) inp.value = cid;
        const nameEl = document.getElementById('mhsPatientWelcomeName');
        if (nameEl && card.fname) nameEl.textContent = 'ยินดีต้อนรับ คุณ' + card.fname + ' ' + (card.lname || '');
        if (card.image || card.photo) {
          let imgStr = String(card.image || card.photo).trim();
          if (imgStr.indexOf('base64,') >= 0) imgStr = imgStr.split('base64,')[1];
          applyPatientPhoto('data:image/jpeg;base64,' + imgStr.replace(/\s/g, ''));
        }
        state.pendingCidLookup = String(cid);
        const stTxt = document.getElementById('mhsStandbyStatusText');
        if (stTxt) stTxt.textContent = 'กำลังตรวจสอบข้อมูลผู้รับบริการใน JHCIS...';
        const lookupBtn = document.getElementById('btnKioskLookup');
        if (lookupBtn) lookupBtn.click();
        // ยิง NHSO Authen อัตโนมัติแบบเบื้องหลัง
        window.__mhsOrigFetch('http://localhost:8189/api/nhso-authen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid: cid, claimType: 'PG0060001', mobile: '0000000000', correlationId: 'MiniHealthStation-001' })
        }).catch(function () {});
      }
    }
  } catch (e) {
  } finally {
    state.isPollingCard = false;
  }
}

// ==================== 6. VHV HEARTBEAT + IDLE AUTO-LOGOUT ====================
function getActiveVhvCid() {
  const shell = document.querySelector('.mhs-kiosk-shell');
  return shell ? (shell.getAttribute('data-vhv-cid') || '') : '';
}

function sendVhvHeartbeat(status, useKeepalive) {
  const cid = getActiveVhvCid();
  const c = scanConnectorFromStorage();
  if (!cid || !c.apiUrl) return;
  try {
    window.__mhsOrigFetch(c.apiUrl + '/jhcis-api/vhv-heartbeat', {
      method: 'POST',
      headers: getConnectorHeaders(),
      body: JSON.stringify({ cid: cid, status: status, apiKey: c.apiSecret }),
      keepalive: Boolean(useKeepalive)
    }).catch(function () {});
  } catch (e) {}
}

function resetIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(function () {
    const dash = document.getElementById('mhsKioskDashboard');
    if (dash && dash.style.display !== 'none') {
      speak('หมดเวลาทำรายการ ระบบได้กลับสู่หน้าเริ่มต้นเพื่อความปลอดภัยแล้วค่ะ');
      window.__mhs.setScreen('standby');
    }
  }, 600000);
}

// ==================== 7. ADMIN DRILL-DOWN, BP FOLLOW-UP & RESEARCH CHARTS ====================
function enhanceAdminTables() {
  // VHV Stats rows clickable -> open drilldown modal
  const vhvBody = document.getElementById('vhvStatsBody');
  if (vhvBody && state.lastVhvStats.length > 0) {
    Array.from(vhvBody.querySelectorAll('tr')).forEach(function (tr, idx) {
      if (tr.dataset.mhsBound) return;
      const item = state.lastVhvStats[idx];
      if (!item || !item.vhv_cid) return;
      tr.dataset.mhsBound = '1';
      tr.className = 'mhs-clickable-row';
      tr.title = 'คลิกเพื่อตรวจสอบรายชื่อผู้ป่วยที่ อสม. ท่านนี้บันทึก';
      tr.addEventListener('click', function () {
        window.__mhs.openVhvDrilldown(item.vhv_cid, item.vhv_name || item.vhv_cid);
      });
    });
  }

  // BP Monitor rows clickable -> open follow-up modal
  const bpBody = document.getElementById('bpMonitorBody');
  if (bpBody && state.lastBpData.length > 0) {
    Array.from(bpBody.querySelectorAll('tr')).forEach(function (tr, idx) {
      if (tr.dataset.mhsBound) return;
      if (!state.lastBpData[idx]) return;
      tr.dataset.mhsBound = '1';
      tr.className = 'mhs-clickable-row';
      tr.title = 'คลิกเพื่อบันทึกติดตามอาการ / Refer';
      tr.addEventListener('click', function () {
        window.__mhs.openBpFollowUp(idx);
      });
    });
  }
}

function renderResearchCharts(data) {
  const box = document.getElementById('mhsResearchChartsBox');
  if (!box || !data) return;
  const g1 = (data.ageGroups && data.ageGroups.gen1) || 0;
  const g2 = (data.ageGroups && data.ageGroups.gen2) || 0;
  const g3 = (data.ageGroups && data.ageGroups.gen3) || 0;
  const g4 = (data.ageGroups && data.ageGroups.gen4) || 0;
  const maxVal = Math.max(1, g1, g2, g3, g4);
  const bars = [
    { lbl: '0-15 ปี', val: g1, color: '#F59E0B' },
    { lbl: '16-35 ปี', val: g2, color: '#3B82F6' },
    { lbl: '36-60 ปี', val: g3, color: '#EC4899' },
    { lbl: '60+ ปี', val: g4, color: '#10B981' }
  ];

  const satData = (data.satisfaction && Array.isArray(data.satisfaction.chartData)) ? data.satisfaction.chartData : [];
  const totalVotes = satData.reduce(function (s, d) { return s + (Number(d.value) || 0); }, 0);
  let accDeg = 0;
  const conicStops = satData.filter(function (d) { return Number(d.value) > 0; }).map(function (d) {
    const start = accDeg;
    const deg = totalVotes > 0 ? (Number(d.value) / totalVotes) * 360 : 0;
    accDeg += deg;
    return (d.color || '#3B82F6') + ' ' + start.toFixed(1) + 'deg ' + accDeg.toFixed(1) + 'deg';
  });

  box.innerHTML = [
    '<div class="grid-2">',
    '  <div class="card" style="background:var(--surface-2) !important;">',
    '    <strong style="display:block;text-align:center;margin-bottom:6px;">กราฟสัดส่วนช่วงอายุผู้ใช้บริการ</strong>',
    '    <div class="mhs-bar-chart">' + bars.map(function (b) {
      const pct = Math.max(4, Math.round((b.val / maxVal) * 100));
      return '<div class="mhs-bar-col"><span class="mhs-bar-val">' + b.val + '</span><div class="mhs-bar-fill" style="height:' + pct + '%;background:' + b.color + ';"></div><span class="mhs-bar-lbl">' + b.lbl + '</span></div>';
    }).join('') + '</div>',
    '  </div>',
    '  <div class="card" style="background:var(--surface-2) !important;display:flex;flex-direction:column;align-items:center;justify-content:center;">',
    '    <strong style="margin-bottom:4px;">ความพึงพอใจเฉลี่ย ' + ((data.satisfaction && data.satisfaction.average) || 0) + ' / 5 ดาว</strong>',
    '    <div style="width:150px;height:150px;border-radius:50%;margin:12px 0;display:flex;align-items:center;justify-content:center;background:' + (conicStops.length ? ('conic-gradient(' + conicStops.join(',') + ')') : '#E2E8F0') + ';">',
    '      <div style="width:94px;height:94px;border-radius:50%;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;"><strong style="font-size:20px;">' + totalVotes + '</strong><small class="muted">โหวต</small></div>',
    '    </div>',
    '    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;font-size:12px;">' + satData.map(function (d) {
      return '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + (d.color || '#3B82F6') + ';margin-right:4px;"></span>' + (d.name || '') + ': ' + (d.value || 0) + '</span>';
    }).join('') + '</div>',
    '  </div>',
    '</div>'
  ].join('');
}

// ==================== 8. GLOBAL OVERLAY MODALS ====================
function injectGlobalModals() {
  if (document.getElementById('mhsGlobalRoot')) return;
  const root = document.createElement('div');
  root.id = 'mhsGlobalRoot';
  root.innerHTML = [
    '<!-- Floating Bluetooth Button -->',
    '<button type="button" class="mhs-bt-fab" onclick="window.__mhs && window.__mhs.openBluetooth()">',
    '  <i class="fa-brands fa-bluetooth-b" style="font-size:17px;"></i> <span id="mhsBtFabText">Bluetooth</span>',
    '</button>',

    '<!-- Modal 1: กรอกเลข 13 หลัก -->',
    '<div id="mhsCidModal" class="mhs-modal-bg" onclick="if(event.target===this)this.classList.remove(\'open\')">',
    '  <div class="mhs-modal-box">',
    '    <button type="button" class="mhs-modal-close" onclick="document.getElementById(\'mhsCidModal\').classList.remove(\'open\')"><i class="fa-solid fa-xmark"></i></button>',
    '    <div style="width:62px;height:62px;border-radius:18px;background:#EFF6FF;color:#007AFF;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px;"><i class="fa-solid fa-id-card"></i></div>',
    '    <h3 style="margin:0 0 6px;font-size:21px;">ค้นหาประวัติผู้รับบริการ</h3>',
    '    <p class="muted" style="margin:0 0 16px;">กรุณากรอกเลขประจำตัวประชาชน 13 หลัก</p>',
    '    <input type="tel" id="mhsModalCidInput" maxlength="13" placeholder="●●●●●●●●●●●●●" style="text-align:center;font-size:24px;font-weight:700;letter-spacing:2px;padding:14px;margin-bottom:14px;" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')" />',
    '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
    '      <button type="button" class="btn btn-outline" onclick="document.getElementById(\'mhsCidModal\').classList.remove(\'open\')">ยกเลิก</button>',
    '      <button type="button" class="btn btn-primary" id="mhsModalCidGo"><i class="fa-solid fa-magnifying-glass"></i> ค้นหาผู้ป่วย</button>',
    '    </div>',
    '  </div>',
    '</div>',

    '<!-- Modal 2: Visual Guide (GIF + Voice + Connect BLE) -->',
    '<div id="mhsGuideModal" class="mhs-modal-bg" onclick="if(event.target===this)window.__mhs.closeGuide()">',
    '  <div class="mhs-modal-box">',
    '    <button type="button" class="mhs-modal-close" onclick="window.__mhs.closeGuide()"><i class="fa-solid fa-xmark"></i></button>',
    '    <h3 id="mhsGuideTitle" style="margin:0;font-size:22px;color:#1E40AF;">วิธีตรวจวัด</h3>',
    '    <div class="mhs-dialog-media"><img id="mhsGuideImg" src="/guide-bp.gif" alt="วิธีตรวจวัด" /></div>',
    '    <p id="mhsGuideDesc" style="margin:0 0 18px;font-size:16px;color:#334155;line-height:1.6;font-weight:600;"></p>',
    '    <button type="button" class="btn btn-primary" style="width:100%;padding:14px;font-size:16px;" onclick="window.__mhs.startGuideBle()">',
    '      <i class="fa-brands fa-bluetooth-b"></i> พร้อมแล้ว! เริ่มเชื่อมต่ออุปกรณ์ Bluetooth',
    '    </button>',
    '  </div>',
    '</div>',

    '<!-- Modal 3: Bluetooth Pairing Manager (5 Devices + Photos) -->',
    '<div id="mhsBtModal" class="mhs-modal-bg" onclick="if(event.target===this)this.classList.remove(\'open\')">',
    '  <div class="mhs-modal-box" style="text-align:left;">',
    '    <button type="button" class="mhs-modal-close" onclick="document.getElementById(\'mhsBtModal\').classList.remove(\'open\')"><i class="fa-solid fa-xmark"></i></button>',
    '    <h3 style="margin:0 0 4px;font-size:20px;"><i class="fa-brands fa-bluetooth-b" style="color:#007AFF;margin-right:8px;"></i>อุปกรณ์ตรวจวัด Bluetooth</h3>',
    '    <p class="muted" style="margin:0 0 14px;">เปิดสวิตช์เพื่อจับคู่เครื่องวัดกับ Mini Health Station</p>',
    '    <div style="display:flex;flex-direction:column;gap:10px;">',
    ['bp|/bp.jpg|เครื่องวัดความดัน (Yuwell BP)', 'o2|/o2.png|เครื่องวัดออกซิเจน (Oximeter)', 'weight|/scale.jpg|เครื่องชั่งน้ำหนัก (ALLWELL Scale)', 'temp|/temp.png|เครื่องวัดอุณหภูมิ (Yuwell HT)', 'sugar|/sugar.png|เครื่องวัดน้ำตาล (Yuwell Glucose)'].map(function (row) {
      const p = row.split('|');
      return '<div style="display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:14px;background:#F8FAFC;border:1px solid var(--border);">' +
        '<div style="width:52px;height:52px;border-radius:10px;background:#FFFFFF;border:1px solid var(--border);padding:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><img src="' + p[1] + '" alt="' + p[2] + '" style="width:100%;height:100%;object-fit:contain;" /></div>' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;">' + p[2] + '</div><div id="mhsBtStatus_' + p[0] + '" style="font-size:12px;color:#94A3B8;">ยังไม่ได้จับคู่อุปกรณ์</div></div>' +
        '<label class="mhs-switch"><input type="checkbox" id="mhsBtToggle_' + p[0] + '" onchange="window.__mhs.toggleDevice(\'' + p[0] + '\', this.checked)" /><span class="mhs-switch-track"><span class="mhs-switch-thumb"></span></span></label>' +
        '</div>';
    }).join(''),
    '    </div>',
    '  </div>',
    '</div>',

    '<!-- Modal 4: Emergency Critical BP (>=180/120) -->',
    '<div id="mhsEmergencyModal" class="mhs-modal-bg" style="background:rgba(185,28,28,0.86);z-index:9999;">',
    '  <div class="mhs-modal-box" style="border:4px solid #FCA5A5;">',
    '    <i class="fa-solid fa-triangle-exclamation" style="font-size:66px;color:#DC2626;margin-bottom:10px;"></i>',
    '    <h2 style="margin:0 0 8px;color:#DC2626;font-size:28px;">อันตราย! ความดันสูงวิกฤต</h2>',
    '    <p style="font-size:18px;font-weight:600;color:#1E293B;margin:0 0 22px;line-height:1.5;">ค่าความดันของคุณคือ <span id="mhsEmergencyBpVal" style="color:#DC2626;font-size:26px;"></span><br/>มีความเสี่ยงเส้นเลือดในสมองแตก กรุณานั่งพักและแจ้งเจ้าหน้าที่ทันที</p>',
    '    <div style="display:flex;flex-direction:column;gap:10px;">',
    '      <a href="tel:1669" class="btn btn-danger" style="padding:16px;font-size:20px;text-decoration:none;"><i class="fa-solid fa-phone-volume"></i> โทรสายด่วน 1669 ทันที</a>',
    '      <button type="button" class="btn btn-outline" style="padding:13px;" onclick="document.getElementById(\'mhsEmergencyModal\').classList.remove(\'open\')">รับทราบและปิดหน้าต่าง</button>',
    '    </div>',
    '  </div>',
    '</div>',

    '<!-- Modal 5: DTX Sugar Fasting -->',
    '<div id="mhsFastingModal" class="mhs-modal-bg" onclick="if(event.target===this)this.classList.remove(\'open\')">',
    '  <div class="mhs-modal-box">',
    '    <h3 style="margin:0 0 6px;font-size:20px;">ประเมินก่อนเจาะน้ำตาลปลายนิ้ว</h3>',
    '    <p class="muted" style="margin:0 0 18px;">กรุณาระบุสภาวะของคนไข้ก่อนเจาะเลือด</p>',
    '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
    '      <button type="button" class="btn btn-primary" style="padding:14px;" onclick="window.__mhs.setFasting(\'งดน้ำ-อาหาร\')">งดน้ำ - อาหารฯ</button>',
    '      <button type="button" class="btn btn-blue" style="padding:14px;" onclick="window.__mhs.setFasting(\'ไม่งดน้ำ-อาหาร\')">ไม่งดน้ำ - อาหารฯ</button>',
    '    </div>',
    '  </div>',
    '</div>',

    '<!-- Modal 6: Telemedicine Jitsi -->',
    '<div id="mhsTelemedModal" class="mhs-modal-bg" onclick="if(event.target===this)window.__mhs.closeTelemed()">',
    '  <div style="width:92vw;height:86vh;background:#0F172A;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);" onclick="event.stopPropagation()">',
    '    <div style="padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.12);color:#FFFFFF;">',
    '      <span style="font-weight:700;font-size:16px;"><i class="fa-solid fa-video" style="color:#38BDF8;margin-right:8px;"></i>ระบบแพทย์ทางไกล (Telemedicine Station)</span>',
    '      <button type="button" class="btn btn-danger btn-sm" onclick="window.__mhs.closeTelemed()"><i class="fa-solid fa-phone-slash"></i> วางสาย</button>',
    '    </div>',
    '    <iframe id="mhsTelemedFrame" allow="camera; microphone; fullscreen; display-capture; autoplay" style="width:100%;flex:1;border:none;"></iframe>',
    '  </div>',
    '</div>',

    '<!-- Modal 7: Admin VHV Drill-down -->',
    '<div id="mhsVhvLogsModal" class="mhs-modal-bg" onclick="if(event.target===this)this.classList.remove(\'open\')">',
    '  <div class="mhs-modal-box xl">',
    '    <button type="button" class="mhs-modal-close" onclick="document.getElementById(\'mhsVhvLogsModal\').classList.remove(\'open\')"><i class="fa-solid fa-xmark"></i></button>',
    '    <h3 id="mhsVhvLogsTitle" style="margin:0 0 12px;font-size:19px;">ประวัติบันทึกผู้ป่วยโดย อสม.</h3>',
    '    <div style="max-height:62vh;overflow:auto;"><table><thead><tr><th>เวลา</th><th>ผู้ป่วย</th><th>นน.</th><th>สส.</th><th>ความดัน</th><th>ชีพจร</th><th>อุณหภูมิ</th><th>เอว</th><th>น้ำตาล</th></tr></thead><tbody id="mhsVhvLogsBody"></tbody></table></div>',
    '  </div>',
    '</div>',

    '<!-- Modal 8: Admin BP Follow-up & Refer -->',
    '<div id="mhsBpFollowModal" class="mhs-modal-bg" onclick="if(event.target===this)this.classList.remove(\'open\')">',
    '  <div class="mhs-modal-box" style="text-align:left;">',
    '    <button type="button" class="mhs-modal-close" onclick="document.getElementById(\'mhsBpFollowModal\').classList.remove(\'open\')"><i class="fa-solid fa-xmark"></i></button>',
    '    <h3 style="margin:0 0 12px;font-size:20px;color:#DC2626;"><i class="fa-solid fa-notes-medical"></i> ติดตามอาการความดันสูง (Follow-up)</h3>',
    '    <div id="mhsBpFollowInfo" style="padding:12px;border-radius:12px;background:#F8FAFC;margin-bottom:12px;font-size:14px;"></div>',
    '    <label style="font-weight:700;font-size:13px;display:block;margin-bottom:6px;">บันทึกผลการติดตาม / การจัดการ:</label>',
    '    <textarea id="mhsBpFollowNote" rows="3" style="margin-bottom:12px;"></textarea>',
    '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">',
    '      <button type="button" id="mhsBtnRefer" class="btn btn-outline" onclick="window.__mhs.setRefer(\'refer\')"><i class="fa-solid fa-truck-medical"></i> ส่งต่อ (Refer)</button>',
    '      <button type="button" id="mhsBtnNoRefer" class="btn btn-outline" onclick="window.__mhs.setRefer(\'norefer\')"><i class="fa-solid fa-house-medical-circle-check"></i> ไม่ส่งต่อ (No Refer)</button>',
    '    </div>',
    '    <button type="button" class="btn btn-green" style="width:100%;padding:12px;" onclick="window.__mhs.saveBpFollowUp()"><i class="fa-solid fa-floppy-disk"></i> บันทึกผลการติดตาม</button>',
    '  </div>',
    '</div>'
    '<!-- Modal 9: Admin Secret Password (กดโลโก้ 5 ครั้ง) -->',
    '<div id="mhsAdminPassModal" class="mhs-modal-bg" onclick="if(event.target===this)this.classList.remove(\'open\')">',
    '  <div class="mhs-modal-box" style="max-width:380px;">',
    '    <button type="button" class="mhs-modal-close" onclick="document.getElementById(\'mhsAdminPassModal\').classList.remove(\'open\')"><i class="fa-solid fa-xmark"></i></button>',
    '    <div style="width:62px;height:62px;border-radius:18px;background:#FEF2F2;color:#EF4444;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 12px;"><i class="fa-solid fa-lock"></i></div>',
    '    <h3 style="margin:0 0 6px;font-size:20px;">เข้าสู่โหมดผู้ดูแลระบบ &amp; ตั้งค่า</h3>',
    '    <p class="muted" style="margin:0 0 14px;">กรุณาใส่รหัสผ่าน Admin หรือ PIN หน่วยงาน</p>',
    '    <input type="password" id="mhsAdminPassInput" placeholder="••••••••" style="text-align:center;font-size:22px;font-weight:700;letter-spacing:4px;padding:12px;margin-bottom:8px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();window.__mhs && window.__mhs.submitAdminPassword();}" />',
    '    <div id="mhsAdminPassErr" style="min-height:22px;color:#DC2626;font-size:13.5px;font-weight:700;margin-bottom:12px;"></div>',
    '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
    '      <button type="button" class="btn btn-outline" onclick="document.getElementById(\'mhsAdminPassModal\').classList.remove(\'open\')">ยกเลิก</button>',
    '      <button type="button" class="btn btn-primary" id="mhsAdminPassBtn" onclick="window.__mhs && window.__mhs.submitAdminPassword()">ยืนยัน</button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(root);

  const cidGo = document.getElementById('mhsModalCidGo');
  const cidIn = document.getElementById('mhsModalCidInput');
  if (cidIn) {
    cidIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (cidGo) cidGo.click(); } });
  }
  if (cidGo) {
    cidGo.addEventListener('click', function () {
      const val = (cidIn ? cidIn.value : '').trim();
      const errEl = document.getElementById('mhsModalCidErr');
      if (val.length !== 13) {
        if (errEl) errEl.textContent = 'กรุณากรอกเลขประจำตัวประชาชนให้ครบ 13 หลัก';
        return;
      }
      if (errEl) errEl.textContent = '';
      cidGo.disabled = true;
      cidGo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังค้นหา...';
      state.pendingCidLookup = val;
      if (state.pendingLookupTimer) clearTimeout(state.pendingLookupTimer);
      state.pendingLookupTimer = setTimeout(function () {
        if (state.pendingCidLookup) {
          state.pendingCidLookup = null;
          cidGo.disabled = false;
          cidGo.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> ค้นหาผู้ป่วย';
          if (errEl) errEl.textContent = 'ค้นหาไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ Local Connector';
        }
      }, 9000);

      const target = document.getElementById('kioskCid');
      if (target) {
        target.value = val;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const btn = document.getElementById('btnKioskLookup');
      if (btn) btn.click();
    });
  }
  refreshBluetoothUI();
}

// ==================== 9. FETCH INTERCEPTOR (ENRICH PAYLOAD & CAPTURE LIVE DATA) ====================
function installFetchInterceptor() {
  if (window.__mhsFetchWrapped) return;
  window.__mhsFetchWrapped = true;
  window.__mhsOrigFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const opts = init ? Object.assign({}, init) : {};

    // Capture connector base URL & x-api-key automatically
    if (url.indexOf('/jhcis-api/') >= 0) {
      const idx = url.indexOf('/jhcis-api/');
      if (idx > 0) state.apiUrl = url.slice(0, idx);
      if (opts.headers) {
        const key = opts.headers['x-api-key'] || opts.headers['X-API-Key'] || (opts.headers.get && opts.headers.get('x-api-key'));
        if (key) state.apiSecret = key;
      }
    }

    // Enrich POST /jhcis-api/queue from Kiosk with SpecialPP, DTX Fasting, Child Nutrition, Breast Cancer
    if (url.indexOf('/jhcis-api/queue') >= 0 && opts.method && opts.method.toUpperCase() === 'POST' && typeof opts.body === 'string') {
      try {
        const body = JSON.parse(opts.body);
        const inKiosk = Boolean(document.getElementById('mhsKioskDashboard'));
        if (inKiosk && !body.isStaff) {
          const valOf = function (id) { const el = document.getElementById(id); return el ? el.value : ''; };
          if (!body.smokeStatus) body.smokeStatus = valOf('kioskSmokeStatus');
          if (!body.smokeAmount) body.smokeAmount = valOf('kioskSmokeAmount') || '1B509';
          if (!body.smokeWake) body.smokeWake = valOf('kioskSmokeWake');
          if (!body.smokeAdvice) body.smokeAdvice = valOf('kioskSmokeAdvice');
          if (!body.alcoholStatus) body.alcoholStatus = valOf('kioskAlcoholStatus');
          if (!body.alcoholAdvice) body.alcoholAdvice = valOf('kioskAlcoholAdvice');
          if (!body.sugarFastingStatus) body.sugarFastingStatus = valOf('kioskSugarFasting');
          if (!body.headCircum && valOf('kioskHeadCircum')) body.headCircum = parseFloat(valOf('kioskHeadCircum')) || 0;
          if (!body.nlevel && valOf('kioskNlevel')) body.nlevel = valOf('kioskNlevel');
          if (!body.nlevel2 && valOf('kioskNlevel2')) body.nlevel2 = valOf('kioskNlevel2');
          if (!body.nlevel3 && valOf('kioskNlevel3')) body.nlevel3 = valOf('kioskNlevel3');
          if (!body.growdevelop) body.growdevelop = valOf('kioskGrowdevelop') || '1';
          if (state.lastPatient) {
            const ageY = state.lastPatient.age_months != null ? Math.floor(Number(state.lastPatient.age_months) / 12) : 0;
            const isF = state.lastPatient.sex === '2' || state.lastPatient.sex === 'หญิง';
            body.breastCancerScreening = Boolean(isF && ageY >= 30 && ageY <= 70);
          }
          opts.body = JSON.stringify(body);
        }
      } catch (e) {}
    }

    let res;
    try {
      res = await window.__mhsOrigFetch(input, opts);
    } catch (netErr) {
      if (url.indexOf('/jhcis-api/patient/') >= 0) {
        state.pendingCidLookup = null;
        if (state.pendingLookupTimer) clearTimeout(state.pendingLookupTimer);
        const cidGoBtn = document.getElementById('mhsModalCidGo');
        const cidErr = document.getElementById('mhsModalCidErr');
        if (cidGoBtn) { cidGoBtn.disabled = false; cidGoBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> ค้นหาผู้ป่วย'; }
        if (cidErr) cidErr.textContent = 'ไม่สามารถเชื่อมต่อ Local Connector / JHCIS ได้';
      }
      throw netErr;
    }

    try {
      const clone = res.clone();
      if (url.indexOf('/api/license/verify') >= 0 && res.ok) {
        clone.json().then(function (d) {
          const t = d && (d.tenant || d);
          if (t && t.api_url) state.apiUrl = String(t.api_url).replace(/\/+$/, '');
          if (t && t.api_secret) state.apiSecret = String(t.api_secret);
          if (t && t.hospcode) state.hospcode = String(t.hospcode);
          if (t && t.hosp_name) state.hospName = String(t.hosp_name);
        }).catch(function () {});
      } else if (url.indexOf('/jhcis-api/patient/') >= 0) {
        const cidGoBtn = document.getElementById('mhsModalCidGo');
        const cidErr = document.getElementById('mhsModalCidErr');
        const stTxt = document.getElementById('mhsStandbyStatusText');
        const resetLookupUi = function () {
          state.pendingCidLookup = null;
          if (state.pendingLookupTimer) clearTimeout(state.pendingLookupTimer);
          if (cidGoBtn) { cidGoBtn.disabled = false; cidGoBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> ค้นหาผู้ป่วย'; }
          if (stTxt) stTxt.textContent = 'กรุณาสอดบัตรประชาชน เพื่อเข้ารับบริการ';
        };

        clone.json().then(function (d) {
          if (res.ok && d && d.success && d.data) {
            resetLookupUi();
            const cidMatch = url.match(/\/patient\/(\d{13})/);
            const cid = cidMatch ? cidMatch[1] : (d.data.cid || '');
            state.lastPatient = Object.assign({}, d.data, { cid: cid });
            const wName = document.getElementById('mhsPatientWelcomeName');
            if (wName) wName.textContent = 'ยินดีต้อนรับ คุณ' + (d.data.fname || '') + ' ' + (d.data.lname || '');
            const cTxt = document.getElementById('kioskChronicText');
            if (cTxt) {
              cTxt.textContent = d.data.chronic || 'ไม่มีโรคประจำตัว';
              cTxt.style.color = (!d.data.chronic || d.data.chronic === 'ไม่มีโรคประจำตัว') ? '#059669' : '#DC2626';
            }
            const ageIn = document.getElementById('kioskAgeMonths');
            if (ageIn && d.data.age_months != null) ageIn.value = d.data.age_months;
            const cidModal = document.getElementById('mhsCidModal');
            if (cidModal) cidModal.classList.remove('open');
            if (document.getElementById('mhsKioskDashboard')) {
              window.__mhs.setScreen('dashboard');
            }
            fetchPatientPhoto(cid);
            updateChildModeUI();
          } else {
            resetLookupUi();
            const msg = (d && d.message) ? d.message : 'ไม่พบข้อมูลผู้ป่วยในระบบ JHCIS กรุณาตรวจสอบเลขบัตร 13 หลัก';
            if (cidErr) cidErr.textContent = msg;
          }
        }).catch(function () {
          resetLookupUi();
          if (cidErr) cidErr.textContent = res.status === 404
            ? 'ไม่พบข้อมูลผู้ป่วยในระบบ JHCIS กรุณาตรวจสอบเลขบัตร 13 หลัก'
            : 'เชื่อมต่อฐานข้อมูล JHCIS ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
        });
      } else if (url.indexOf('/jhcis-api/queue') >= 0 && opts.method && opts.method.toUpperCase() === 'POST' && res.ok) {
        if (document.getElementById('mhsKioskDashboard')) {
          speak('บันทึกข้อมูลและจัดคิวเข้าสู่ระบบสำเร็จ ขอบคุณที่ใช้บริการค่ะ');
          setTimeout(function () {
            state.lastPatient = null;
            applyPatientPhoto(null);
            window.__mhs.setScreen('standby');
          }, 2500);
        }
      } else if (url.indexOf('/jhcis-api/vhv-stats') >= 0 && res.ok) {
        clone.json().then(function (d) {
          if (d && d.success && Array.isArray(d.data)) {
            state.lastVhvStats = d.data;
            setTimeout(enhanceAdminTables, 120);
          }
        }).catch(function () {});
      } else if (url.indexOf('/jhcis-api/bp-monitor') >= 0 && res.ok) {
        clone.json().then(function (d) {
          if (d && d.success && Array.isArray(d.data)) {
            state.lastBpData = d.data;
            setTimeout(enhanceAdminTables, 120);
          }
        }).catch(function () {});
      } else if (url.indexOf('/jhcis-api/analytics') >= 0 && res.ok) {
        clone.json().then(function (d) {
          if (d && d.success && d.data) {
            state.lastAnalytics = d.data;
            setTimeout(function () { renderResearchCharts(d.data); }, 120);
          }
        }).catch(function () {});
      }
    } catch (e) {}

    return res;
  };
}

// ==================== 10. GLOBAL API & EVENT DELEGATION ====================
export function initSuperFeatures() {
  if (window.__mhsSuperInit) return;
  window.__mhsSuperInit = true;

  installFetchInterceptor();
  injectGlobalModals();
  scanConnectorFromStorage();

  window.__mhs = {
    setScreen: function (mode) {
      const s = document.getElementById('mhsKioskStandby');
      const d = document.getElementById('mhsKioskDashboard');
      if (!s || !d) return;
      if (mode === 'dashboard') { s.style.display = 'none'; d.style.display = 'block'; }
      else { d.style.display = 'none'; s.style.display = 'flex'; }
    },
    openCidModal: function () {
      const m = document.getElementById('mhsCidModal');
      const inp = document.getElementById('mhsModalCidInput');
      const err = document.getElementById('mhsModalCidErr');
      const go = document.getElementById('mhsModalCidGo');
      if (inp) inp.value = '';
      if (err) err.textContent = '';
      if (go) { go.disabled = false; go.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> ค้นหาผู้ป่วย'; }
      if (m) m.classList.add('open');
      if (inp) setTimeout(function () { inp.focus(); }, 60);
    },
    openGuide: function (type) {
      const cfg = {
        bp: ['วิธีวัดความดันโลหิต', '/guide-bp.gif', 'สอดแขนเข้าไปในอุโมงค์ให้พอดีกับข้อพับ วางแขนราบบนโต๊ะ นั่งหลังตรง แล้วอยู่นิ่งๆ นะคะ', connectBluetoothBP],
        o2: ['วิธีวัดออกซิเจนปลายนิ้ว', '/guide-o2.gif', 'สอดนิ้วชี้เข้าไปในเครื่องให้สุด วางมือราบกับโต๊ะ แล้วอยู่นิ่งๆ ห้ามขยับนิ้วค่ะ', connectBluetoothO2],
        weight: ['วิธีชั่งน้ำหนัก', '/guide-weight.gif', 'ถอดรองเท้า แล้วก้าวขึ้นยืนบนเครื่องชั่งน้ำหนักให้เต็มเท้าทั้งสองข้างค่ะ', connectBluetoothWeight],
        temp: ['วิธีวัดอุณหภูมิ', '/guide-temp.gif', 'นำเครื่องวัดจ่อที่บริเวณหน้าผาก ห่างประมาณ 3 เซนติเมตร แล้วกดปุ่มวัดค่ะ', connectBluetoothTemp],
        sugar: ['วิธีวัดน้ำตาลในเลือด', '/guide-sugar.gif', 'เปลี่ยนเข็มใหม่ทุกครั้ง เจาะที่ปลายนิ้วด้านข้าง แล้วบีบเลือดลงบนแผ่นตรวจค่ะ', connectBluetoothSugar]
      }[type];
      if (!cfg) return;
      document.getElementById('mhsGuideTitle').textContent = cfg[0];
      document.getElementById('mhsGuideImg').src = cfg[1];
      document.getElementById('mhsGuideDesc').textContent = cfg[2];
      state.guideAction = cfg[3];
      document.getElementById('mhsGuideModal').classList.add('open');
      speak(cfg[2]);
    },
    closeGuide: function () {
      if (state.currentAudio) { try { state.currentAudio.pause(); } catch (e) {} state.currentAudio = null; }
      document.getElementById('mhsGuideModal').classList.remove('open');
    },
    startGuideBle: async function () {
      window.__mhs.closeGuide();
      if (state.guideAction) await state.guideAction();
    },
    openBluetooth: function () {
      refreshBluetoothUI();
      document.getElementById('mhsBtModal').classList.add('open');
    },
    toggleDevice: function (key, checked) {
      if (!checked) { updateDeviceState(key, ''); return; }
      const map = { bp: connectBluetoothBP, o2: connectBluetoothO2, weight: connectBluetoothWeight, temp: connectBluetoothTemp, sugar: connectBluetoothSugar };
      if (map[key]) map[key]();
    },
    openFastingModal: function () {
      document.getElementById('mhsFastingModal').classList.add('open');
    },
    setFasting: function (val) {
      const hid = document.getElementById('kioskSugarFasting');
      const tag = document.getElementById('kioskFastingTag');
      if (hid) hid.value = val;
      if (tag) { tag.innerHTML = val + ' <i class="fa-solid fa-pen"></i>'; tag.style.display = 'inline-flex'; }
      document.getElementById('mhsFastingModal').classList.remove('open');
      const sEl = document.getElementById('kioskSugar');
      if (sEl) setTimeout(function () { sEl.focus(); }, 80);
    },
    openTelemed: function () {
      const room = 'MiniHealthStation-' + (state.hospcode || '02506');
      const frame = document.getElementById('mhsTelemedFrame');
      if (frame) frame.src = 'https://meet.jit.si/' + room + '#config.disableDeepLinking=true&config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false';
      document.getElementById('mhsTelemedModal').classList.add('open');
    },
    closeTelemed: function () {
      const frame = document.getElementById('mhsTelemedFrame');
      if (frame) frame.src = 'about:blank';
      document.getElementById('mhsTelemedModal').classList.remove('open');
    },
    toggleSidebar: function () {
      const sv = document.getElementById('staffSplitView');
      if (sv) sv.classList.toggle('sidebar-hidden');
    },
    filterQueueTab: function (mode, btn) {
      document.querySelectorAll('[data-qfilter]').forEach(function (b) { b.classList.remove('active'); });
      if (btn) btn.classList.add('active');
      const list = document.getElementById('todayQueueList');
      if (!list) return;
      Array.from(list.children).forEach(function (item) {
        const txt = item.textContent || '';
        const isDone = txt.indexOf('ตรวจแล้ว') >= 0;
        if (mode === 'all') item.style.display = '';
        else if (mode === 'done') item.style.display = isDone ? '' : 'none';
        else item.style.display = isDone ? 'none' : '';
      });
    },
    fillNormalGA: function () {
      const dn = document.getElementById('stDiagNote');
      const cc = document.getElementById('stSymptoms');
      if (dn) dn.value = 'GA: Alert, cooperative, HEENT: Not pale, Heart: Normal S1S2, Lung: Clear both lungs';
      if (cc && !cc.value.trim()) cc.value = 'ตรวจติดตามอาการทั่วไป';
    },
    quickIcd: function (code) {
      const inp = document.getElementById('icdSearchInput');
      const btn = document.getElementById('btnSearchIcd');
      if (inp) inp.value = code;
      if (btn) btn.click();
    },
    openVhvDrilldown: async function (vhvCid, vhvName) {
      const c = scanConnectorFromStorage();
      if (!c.apiUrl) return;
      document.getElementById('mhsVhvLogsTitle').textContent = 'ข้อมูลบันทึกผู้ป่วยโดย: ' + vhvName;
      const body = document.getElementById('mhsVhvLogsBody');
      body.innerHTML = '<tr><td colspan="9" class="muted">กำลังดึงข้อมูลจาก JHCIS...</td></tr>';
      document.getElementById('mhsVhvLogsModal').classList.add('open');
      try {
        const res = await window.__mhsOrigFetch(c.apiUrl + '/jhcis-api/vhv-logs/' + vhvCid + '?t=' + Date.now(), { headers: getConnectorHeaders() });
        const d = await res.json();
        const rows = (d && d.success && Array.isArray(d.data)) ? d.data : [];
        body.innerHTML = rows.length ? rows.map(function (r) {
          return '<tr><td>' + (r.record_time || '-') + '</td><td><strong>' + (r.patient_name || r.patient_cid || '-') + '</strong></td><td>' + (r.weight > 0 ? r.weight : '-') + '</td><td>' + (r.height > 0 ? r.height : '-') + '</td><td><strong>' + (r.sys_dia || '-') + '</strong></td><td>' + (r.pulse > 0 ? r.pulse : '-') + '</td><td>' + (r.temp > 0 ? Number(r.temp).toFixed(1) : '-') + '</td><td>' + (r.waist > 0 ? r.waist : '-') + '</td><td style="color:#6366F1;font-weight:700;">' + (r.sugar > 0 ? r.sugar : '-') + '</td></tr>';
        }).join('') : '<tr><td colspan="9" class="muted">ยังไม่มีประวัติการบันทึกข้อมูล</td></tr>';
      } catch (e) {
        body.innerHTML = '<tr><td colspan="9" style="color:#DC2626;">ดึงข้อมูลไม่สำเร็จ</td></tr>';
      }
    },
    openBpFollowUp: function (idx) {
      const item = state.lastBpData[idx];
      if (!item) return;
      state.selectedBpIdx = idx;
      let raw = item.follow_up_note || '';
      if (raw.indexOf('[REFER] ') === 0) { state.referStatus = 'refer'; raw = raw.slice(8); }
      else if (raw.indexOf('[NOREFER] ') === 0) { state.referStatus = 'norefer'; raw = raw.slice(10); }
      else state.referStatus = '';
      document.getElementById('mhsBpFollowInfo').innerHTML = '<strong>คุณ' + (item.patient_name || '-') + '</strong> · ความดัน <strong style="color:#DC2626;">' + (item.sys_dia || '-') + '</strong> (' + (item.levelName || '') + ')<br/><span class="muted">เวลา ' + (item.record_time || '-') + ' น. · อสม.: ' + (item.vhv_name || '-') + '</span>';
      document.getElementById('mhsBpFollowNote').value = raw || ('ติดตามอาการที่ ' + (state.hospName || 'รพ.สต.') + ' ');
      window.__mhs.setRefer(state.referStatus);
      document.getElementById('mhsBpFollowModal').classList.add('open');
    },
    setRefer: function (status) {
      state.referStatus = status;
      const b1 = document.getElementById('mhsBtnRefer');
      const b2 = document.getElementById('mhsBtnNoRefer');
      if (b1) b1.style.borderColor = status === 'refer' ? '#EF4444' : '';
      if (b1) b1.style.background = status === 'refer' ? '#FEE2E2' : '';
      if (b2) b2.style.borderColor = status === 'norefer' ? '#10B981' : '';
      if (b2) b2.style.background = status === 'norefer' ? '#D1FAE5' : '';
    },
    saveBpFollowUp: async function () {
      const item = state.lastBpData[state.selectedBpIdx];
      const c = scanConnectorFromStorage();
      if (!item || !c.apiUrl) return;
      let note = document.getElementById('mhsBpFollowNote').value || '';
      if (state.referStatus === 'refer') note = '[REFER] ' + note;
      else if (state.referStatus === 'norefer') note = '[NOREFER] ' + note;
      try {
        await window.__mhsOrigFetch(c.apiUrl + '/jhcis-api/bp-followup', {
          method: 'POST',
          headers: getConnectorHeaders(),
          body: JSON.stringify({ log_id: item.log_id, note: note })
        });
        document.getElementById('mhsBpFollowModal').classList.remove('open');
        const btn = document.getElementById('btnLoadBpMonitor');
        if (btn) btn.click();
        alert('✅ บันทึกผลการติดตามอาการเรียบร้อย');
      } catch (e) {
        alert('❌ บันทึกไม่สำเร็จ');
      }
    },
    copyResearchWord: function () {
      const d = state.lastAnalytics;
      const box = document.getElementById('researchSummaryBox');
      let text = (d && d.summary) ? d.summary : (box ? box.textContent : '');
      if (d && d.usage && d.usage.total > 0 && d.ageGroups) {
        const t = d.usage.total;
        text += ' สัดส่วนช่วงอายุ: 0-15 ปี (' + ((d.ageGroups.gen1 / t) * 100).toFixed(1) + '%), 16-35 ปี (' + ((d.ageGroups.gen2 / t) * 100).toFixed(1) + '%), 36-60 ปี (' + ((d.ageGroups.gen3 / t) * 100).toFixed(1) + '%), 60 ปีขึ้นไป (' + ((d.ageGroups.gen4 / t) * 100).toFixed(1) + '%)';
      }
      navigator.clipboard.writeText(text).then(function () { alert('📋 คัดลอกสรุปผลวิจัยไปใส่ Word เรียบร้อยแล้ว'); });
    },
    handleLogoUpload: function (input) {
      const f = input.files && input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onloadend = function () {
        localStorage.setItem('custom_logo', r.result);
        const pv = document.getElementById('adminLogoPreview');
        if (pv) pv.src = r.result;
        const lg = document.getElementById('mhsCustomLogoImg');
        if (lg) { lg.src = r.result; lg.style.display = 'block'; }
        alert('✅ เปลี่ยนรูปโลโก้เรียบร้อยแล้ว');
      };
      r.readAsDataURL(f);
    },
    handleVideoUpload: function (input) {
      const f = input.files && input.files[0];
      if (!f) return;
      if (f.size > 6 * 1024 * 1024) { alert('⚠️ ไฟล์วิดีโอใหญ่เกิน 5-6MB'); return; }
      const r = new FileReader();
      r.onloadend = function () {
        try {
          localStorage.setItem('custom_video', r.result);
          const pv = document.getElementById('adminVideoPreview');
          if (pv) { pv.src = r.result; pv.load(); pv.play().catch(function(){}); }
          alert('✅ เปลี่ยนวิดีโอพื้นหลังเรียบร้อยแล้ว');
        }
        catch (e) { alert('⚠️ ไฟล์ใหญ่เกินความจุ LocalStorage'); }
      };
      r.readAsDataURL(f);
    },
    resetMedia: function () {
      localStorage.removeItem('custom_logo');
      localStorage.removeItem('custom_video');
      localStorage.removeItem('custom_hosp_name');
      const lp = document.getElementById('adminLogoPreview'); if (lp) lp.src = '/TK.png';
      const vp = document.getElementById('adminVideoPreview'); if (vp) { vp.src = '/bg-video.mp4'; vp.load(); }
      alert('✅ คืนค่าโลโก้ วิดีโอ และชื่อหน่วยงานเริ่มต้นแล้ว');
    }
  };

  // Document-level event delegation (survives all re-renders in web-app)
  document.addEventListener('input', function (e) {
    const id = e.target && e.target.id;
    if (id === 'kioskPressure' || id === 'stPressure') {
      let v = e.target.value.replace(/[^\d/]/g, '');
      if (v.length === 3 && v.indexOf('/') === -1 && e.inputType !== 'deleteContentBackward') v += '/';
      if (v.split('/').length > 2) v = v.slice(0, -1);
      e.target.value = v;
    }
    if (['kioskWeight', 'kioskHeight', 'kioskPressure', 'kioskSugar', 'kioskAgeMonths', 'stWeight', 'stHeight'].includes(id)) {
      evaluateKioskHealth();
    }
  });

  document.addEventListener('change', function (e) {
    const id = e.target && e.target.id;
    if (id === 'kioskPhotoInput' || id === 'staffPhotoInput') {
      handleCameraCapture(e.target.files && e.target.files[0]);
    } else if (id === 'kioskServiceType') {
      updateChildModeUI();
    } else if (id === 'kioskSmokeStatus') {
      const box = document.getElementById('kioskSmokeSubBox');
      if (box) box.style.display = e.target.value === 'ยังสูบอยู่' ? 'block' : 'none';
    } else if (id === 'kioskAlcoholStatus') {
      const box = document.getElementById('kioskAlcoholSubBox');
      if (box) box.style.display = e.target.value === 'ยังดื่มอยู่' ? 'block' : 'none';
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'kioskSugar') {
      const hid = document.getElementById('kioskSugarFasting');
      if (hid && !hid.value) {
        e.target.blur();
        window.__mhs.openFastingModal();
      }
    }
  });

  ['mousemove', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();

  // Timers: Clock + Auto-switch Standby->Dashboard + Smartcard Poll + BP Auto-hunt + Heartbeat
  function syncTopbarAndHosp() {
    // 1. ซ่อนปุ่มเลือกโหมด (โหมดเจ้าหน้าที่ / โหมด อสม. / Admin หน่วยงาน) บนแถบหัวเว็บ
    document.querySelectorAll('header button, .topbar button, .app-header button, nav button').forEach(function (btn) {
      const txt = (btn.textContent || '').trim();
      if (txt.indexOf('โหมดเจ้าหน้าที่') >= 0) {
        state.modeButtons.staff = btn;
        btn.style.setProperty('display', 'none', 'important');
      } else if (txt.indexOf('โหมด อสม') >= 0 || txt.indexOf('Kiosk') >= 0) {
        state.modeButtons.vhv = btn;
        btn.style.setProperty('display', 'none', 'important');
      } else if (txt.indexOf('Admin หน่วยงาน') >= 0 || txt.indexOf('Admin') === 0) {
        state.modeButtons.admin = btn;
        btn.style.setProperty('display', 'none', 'important');
      }
    });

    // ผูก 5-click ลับไว้ที่ชื่อหน่วยงานบนแถบหัวเว็บด้านซ้ายด้วย (เผื่ออยู่หน้าอื่นที่ไม่มีโลโก้ Kiosk)
    const brandBlock = document.querySelector('header > div:first-child, .topbar > div:first-child, .app-header > div:first-child');
    if (brandBlock && !brandBlock.dataset.mhsSecretBound) {
      brandBlock.dataset.mhsSecretBound = '1';
      brandBlock.style.cursor = 'pointer';
      brandBlock.addEventListener('click', function () { window.__mhs && window.__mhs.handleSecretLogoClick(); });
    }

    // 2. ซิงก์ชื่อ รพ.สต. จริงใส่ #kioskHospLabel
    const hospEl = document.getElementById('kioskHospLabel');
    if (hospEl) {
      const customName = localStorage.getItem('custom_hosp_name');
      if (customName) {
        if (hospEl.textContent !== customName) hospEl.textContent = customName;
      } else {
        scanConnectorFromStorage();
        let resolved = state.hospName ? (state.hospName + (state.hospcode ? ' [' + state.hospcode + ']' : '')) : '';
        if (!resolved && brandBlock) {
          const firstLine = (brandBlock.innerText || '').split('\n')[0].trim();
          if (firstLine && firstLine.indexOf('Mini Health') === -1) resolved = firstLine;
        }
        if (resolved && hospEl.textContent.trim() === 'โรงพยาบาลส่งเสริมสุขภาพตำบล') {
          hospEl.textContent = resolved;
        }
      }
    }
  }

  syncTopbarAndHosp();

  setInterval(function () {
    syncTopbarAndHosp();
    const clockEl = document.getElementById('kioskLiveClock');
    if (clockEl) {
      const d = new Date();
      const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
      clockEl.textContent = d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543) + ' เวลา ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0') + ' น.';
    }
    const hospEl = document.getElementById('kioskHospLabel');
    const headerStrong = document.querySelector('header strong, .topbar strong, .app-header strong');
    if (hospEl && headerStrong && hospEl.textContent.trim() === 'โรงพยาบาลส่งเสริมสุขภาพตำบล') {
      hospEl.textContent = headerStrong.textContent.trim();
    }
    refreshBluetoothUI();
    enhanceAdminTables();
  }, 800);

  setInterval(pollSmartcardStandby, 2500);
  setInterval(huntForPairedBP, 3000);
  setInterval(function () { sendVhvHeartbeat('online', false); }, 10000);
  window.addEventListener('beforeunload', function () { sendVhvHeartbeat('offline', true); });
  window.addEventListener('pagehide', function () { sendVhvHeartbeat('offline', true); });
}
