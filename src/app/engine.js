// Mini Health Station Multi-Tenant SaaS — Core Engine (Cloud + JHCIS + BLE + TTS + Camera)
export const DEFAULT_CLOUD_URL = 'https://mini-health-saas-cloud.sirapop-nick.workers.dev';

export const DEFAULT_CC_PRESETS = [
  'ผู้ป่วย NCD กลุ่มสีเขียว รับบริการที่ health station ประจำหมู่บ้าน โดย อสม.',
  'คัดกรอง เบาหวาน-ความดันโลหิตสูง อายุ 35 ปี ขึ้นไป',
  'ตรวจและรับยาความดันโลหิตสูง',
  'ตรวจและรับยาเบาหวาน',
  'ตรวจภาวะโภชนาการเด็ก 0-72 เดือน',
  'ส่งเสริมด้านการแพทย์แผนไทย',
  'ตัวร้อน มีไข้สูง เป็นมาแล้ว 1 วัน',
  'ติดตามอาการผู้ป่วยข้อเข่าเสื่อม',
  'เยี่ยมบ้านผู้ป่วยโรคเรื้อรัง',
  'ให้บริการวัคซีนไข้หวัดใหญ่'
];

export const DEFAULT_PI_PRESETS = [
  'อาการทั่วไปปกติ',
  'กินยาต่อเนื่องสม่ำเสมอ',
  'ปฏิเสธโรคประจำตัวและการแพ้ยา',
  'ตรวจคัดกรอง NCD โดย อสม.',
  'ไม่มีภาวะซึมเศร้า',
  'ไม่มีเดินเซ ปากเบี้ยว พูดคุยรู้เรื่องชัดเจน',
  'วัดความดันโลหิต',
  'รับยาความดันโลหิตสูง',
  'ส่งเสริมด้านการแพทย์แผนไทยและแพทย์ทางเลือก'
];

export const DOSE_PRESETS = [
  'รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร',
  'รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น',
  'รับประทานครั้งละ 1 เม็ด วันละ 1 ครั้ง ก่อนนอน',
  'รับประทานครั้งละ 1 เม็ด เวลาปวดหรือมีไข้ ทุก 4-6 ชม.',
  'ทาถูนวดบริเวณที่มีอาการ วันละ 2-3 ครั้ง'
];

export function loadTenantSession() {
  const keys = ['mhs_tenant_session', 'tenantSession', 'tenant_session'];
  for (let i = 0; i < keys.length; i++) {
    try {
      const raw = localStorage.getItem(keys[i]);
      if (raw) {
        const obj = JSON.parse(raw);
        const t = Object.assign({}, obj.tenant || obj);
        if (!t.license_key) t.license_key = t.licenseKey || obj.license_key || obj.licenseKey || '';
        if (t && t.hospcode && t.api_url && t.api_secret) return t;
      }
    } catch (e) {}
  }
  return null;
}

export function saveTenantSession(tenant) {
  localStorage.setItem('mhs_tenant_session', JSON.stringify(tenant));
}

export function clearTenantSession() {
  ['mhs_tenant_session', 'tenantSession', 'tenant_session'].forEach((k) => localStorage.removeItem(k));
}

export const AppState = {
  tenant: loadTenantSession(),
  cloudUrl: localStorage.getItem('mhs_cloud_url') || DEFAULT_CLOUD_URL,
  view: loadTenantSession() ? 'home' : 'tenant_login', // tenant_login | home | kiosk | staff | admin
  user: null, // { cid, name, roles, isStaff }
  patient: null,
  patientImage: null,
  activeVisitNo: null,
  serviceType: 'health_station',
  vitals: { height: '', weight: '', waist: '', bmi: '', temp: '', spo2: '', sysDia: '', pulse: '', sugar: '', headCircum: '' },
  childDev: { nlevel: '3', nlevel2: '3', nlevel3: '4', growdevelop: '1' },
  sugarFasting: '',
  smokeStatus: '', smokeAmount: '1B509', smokeWake: '', smokeAdvice: '',
  alcoholStatus: '', alcoholAdvice: '',
  customSymptoms: '', customSymptomsco: '', diagNote: '',
  timeService: '1', foodAllergy: '',
  drugAllergies: [], icd10List: [], drugList: [],
  icdSearch: '', icdResults: [], drugCategory: 'all', drugSearch: '', drugResults: [],
  todayQueue: [], queueFilter: 'waiting', queueSearch: '',
  patientHistory: [], staffTab: 'visit', sidebarCollapsed: false, sidebarMobileOpen: false, showMoreMenu: false,
  aiLoading: false, aiResponse: '',
  adminTab: 'settings', adminPin: sessionStorage.getItem('mhs_admin_pin') || '',
  tenantUsers: [], cloudPresets: [], excelRows: [],
  vhvStats: [], vhvLogs: [], selectedVhvName: '',
  bpDate: new Date().toISOString().slice(0, 10), bpData: [], selectedBp: null, followNote: '', referStatus: '',
  analytics: null,
  offlineQueue: JSON.parse(localStorage.getItem('offline_queue') || '[]'),
  ccPresets: JSON.parse(localStorage.getItem('jhcis_symptoms_presets') || 'null') || DEFAULT_CC_PRESETS.slice(),
  piPresets: JSON.parse(localStorage.getItem('jhcis_symptomsco_presets') || 'null') || DEFAULT_PI_PRESETS.slice(),
  devices: {
    weight: localStorage.getItem('dev_weight') || '',
    temp: localStorage.getItem('dev_temp') || '',
    bp: localStorage.getItem('dev_bp') || '',
    sugar: localStorage.getItem('dev_sugar') || '',
    o2: localStorage.getItem('dev_o2') || ''
  },
  customLogo: localStorage.getItem('custom_logo') || '/logo.png',
  customVideo: localStorage.getItem('custom_video') || '/bg-video.mp4',
  customHospName: localStorage.getItem('custom_hosp_name') || '',
  modal: null, // null | vhv_login | manual_cid | bt | guide | telemed | emergency | confirm_save | rating | admin_pass | preset | vhv_logs | bp_follow | sheet_icd | sheet_drug | sheet_ncd | sheet_allergy | sheet_dose | sugar_fasting
  modalData: {},
  ratingScore: 5,
  adminClicks: 0,
  adminClickTimer: null,
  audioCache: {},
  currentAudio: null
};

export function getHospDisplay() {
  if (AppState.customHospName) return AppState.customHospName;
  if (AppState.tenant) return (AppState.tenant.hosp_name || 'รพ.สต.') + ' [' + AppState.tenant.hospcode + ']';
  return 'Mini Health Station';
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

export async function cloudFetch(endpoint, opts = {}) {
  const t = AppState.tenant;
  const pinEl = typeof document !== 'undefined' ? document.getElementById('admCloudPin') : null;
  if (pinEl && pinEl.value.trim()) {
    AppState.adminPin = pinEl.value.trim();
    sessionStorage.setItem('mhs_admin_pin', AppState.adminPin);
  }
  const lic = t && (t.license_key || t.licenseKey || '');
  if (endpoint !== '/api/license/verify' && (!t || !t.hospcode || !lic)) {
    return {
      ok: false,
      status: 400,
      data: { message: 'ไม่พบ License Key ในเซสชันเดิม กรุณากด "ออกจากสถานบริการ" ในแท็บตั้งค่าระบบ แล้วล็อกอินใหม่' }
    };
  }
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (t && t.hospcode) headers['x-hospcode'] = String(t.hospcode);
  if (lic) headers['x-license-key'] = String(lic);
  if (AppState.adminPin) headers['x-tenant-admin-pin'] = String(AppState.adminPin);

  try {
    const res = await fetch(AppState.cloudUrl.replace(/\/+$/, '') + endpoint, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { message: 'เชื่อมต่อระบบกลางไม่สำเร็จ (Network/CORS): ' + (err && err.message ? err.message : String(err)) }
    };
  }
}

export async function jhcisFetch(endpoint, opts = {}) {
  const t = AppState.tenant;
  if (!t || !t.api_url) throw new Error('ยังไม่ได้เชื่อมต่อสถานบริการ');
  const headers = Object.assign({ 'Content-Type': 'application/json', 'x-api-key': t.api_secret || '' }, opts.headers || {});
  const res = await fetch(String(t.api_url).replace(/\/+$/, '') + endpoint, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function speak(text) {
  if (!text) return;
  if (AppState.currentAudio) { try { AppState.currentAudio.pause(); } catch (e) {} AppState.currentAudio = null; }
  try {
    let url = AppState.audioCache[text];
    if (!url && AppState.tenant && AppState.tenant.api_url) {
      const r = await jhcisFetch('/jhcis-api/tts', { method: 'POST', body: JSON.stringify({ text }) });
      if (r.ok && r.data && r.data.audioContent) {
        const bin = atob(r.data.audioContent);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' }));
        AppState.audioCache[text] = url;
      }
    }
    if (url) {
      const a = new Audio(url);
      a.playbackRate = 1.15;
      AppState.currentAudio = a;
      a.play().catch(() => {});
      return;
    }
  } catch (e) {}
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'th-TH'; u.rate = 1.05;
      window.speechSynthesis.speak(u);
    }
  } catch (e) {}
}

export function recalcVitals() {
  const h = parseFloat(AppState.vitals.height) / 100;
  const w = parseFloat(AppState.vitals.weight);
  AppState.vitals.bmi = (h > 0 && w > 0) ? (w / (h * h)).toFixed(2) : '';

  if (AppState.patient && AppState.patient.age_months != null && Number(AppState.patient.age_months) <= 60 && w > 0 && h > 0) {
    const hCm = parseFloat(AppState.vitals.height);
    const age = Number(AppState.patient.age_months);
    if (w >= 35 || hCm >= 130 || w <= 2 || hCm <= 40) {
      AppState.childDev = { nlevel: '99', nlevel2: '99', nlevel3: '99', growdevelop: '1' };
    } else {
      let n1 = '3', n2 = '3', n3 = '4';
      const bmi = w / (h * h);
      if (bmi > 18.5) n3 = '1'; else if (bmi > 17.5) n3 = '2'; else if (bmi > 16.5) n3 = '3';
      else if (bmi < 13.5) n3 = '6'; else if (bmi < 14.5) n3 = '5';
      const avgW = (age * 0.25) + 3;
      if (w > avgW * 1.3) n1 = '1'; else if (w > avgW * 1.15) n1 = '2'; else if (w < avgW * 0.7) n1 = '5'; else if (w < avgW * 0.85) n1 = '4';
      const avgH = (age * 0.8) + 50;
      if (hCm > avgH * 1.1) n2 = '1'; else if (hCm > avgH * 1.05) n2 = '2'; else if (hCm < avgH * 0.9) n2 = '5'; else if (hCm < avgH * 0.95) n2 = '4';
      AppState.childDev = { nlevel: n1, nlevel2: n2, nlevel3: n3, growdevelop: '1' };
    }
  }
}

export function analyzeHealth() {
  const alerts = [];
  let isEmergency = false;
  const b = parseFloat(AppState.vitals.bmi);
  if (b > 0) {
    if (b >= 30) alerts.push({ icon: 'fa-triangle-exclamation', title: 'โรคอ้วนระดับ 2 (BMI: ' + b + ')', desc: 'เสี่ยงโรคแทรกซ้อนสูงมาก แนะนำพบแพทย์และปรับพฤติกรรมด่วน', color: '#dc2626' });
    else if (b >= 25) alerts.push({ icon: 'fa-circle-exclamation', title: 'โรคอ้วนระดับ 1 (BMI: ' + b + ')', desc: 'ควรเริ่มควบคุมอาหารและออกกำลังกาย', color: '#ea580c' });
    else if (b >= 23) alerts.push({ icon: 'fa-bell', title: 'น้ำหนักเกิน (BMI: ' + b + ')', desc: 'ควรระวังเรื่องอาหารการกิน', color: '#ca8a04' });
    else if (b >= 18.5) alerts.push({ icon: 'fa-circle-check', title: 'น้ำหนักปกติ (BMI: ' + b + ')', desc: 'รักษาสุขภาพได้ดีมากครับ', color: '#16a34a' });
    else alerts.push({ icon: 'fa-circle-info', title: 'น้ำหนักต่ำกว่าเกณฑ์ (BMI: ' + b + ')', desc: 'ควรรับประทานอาหารที่มีประโยชน์เพิ่มขึ้น', color: '#2563eb' });
  }
  if (AppState.vitals.sysDia && AppState.vitals.sysDia.indexOf('/') > 0) {
    const p = AppState.vitals.sysDia.split('/').map(Number);
    if (p[0] >= 180 || p[1] >= 120) {
      isEmergency = true;
      alerts.push({ icon: 'fa-heart-crack', title: 'ความดันโลหิตสูงวิกฤต!', desc: 'อันตราย! เสี่ยงหลอดเลือดสมองแตก กรุณานั่งพัก แจ้งเจ้าหน้าที่ทันที หรือโทร 1669', color: '#dc2626' });
    } else if (p[0] >= 140 || p[1] >= 90) {
      alerts.push({ icon: 'fa-heart-circle-exclamation', title: 'ความดันโลหิตสูง', desc: 'ควรพบแพทย์เพื่อประเมินอาการอย่างละเอียด', color: '#ea580c' });
    } else if (p[0] > 0 && (p[0] <= 90 || p[1] <= 60)) {
      alerts.push({ icon: 'fa-heart-circle-minus', title: 'ความดันโลหิตต่ำ', desc: 'อาจมีอาการหน้ามืด วิงเวียน ควรพักผ่อนและดื่มน้ำให้เพียงพอ', color: '#2563eb' });
    } else if (p[0] > 0 && p[1] > 0) {
      alerts.push({ icon: 'fa-heart-circle-check', title: 'ความดันโลหิตปกติ', desc: 'อยู่ในเกณฑ์ที่ดีครับ', color: '#16a34a' });
    }
  }
  return { alerts, isEmergency };
}

export function parseBPData(dv) {
  let o = 0;
  const f = dv.getUint8(o++);
  const isKpa = (f & 1) !== 0, hasTs = (f & 2) !== 0, hasPr = (f & 4) !== 0;
  const sfloat = (pos) => {
    const raw = dv.getUint16(pos, true);
    const m = raw & 0x0FFF;
    let e = raw >> 12;
    if (e >= 8) e = -((~e & 0x0F) + 1);
    return m * Math.pow(10, e);
  };
  const sys = sfloat(o); o += 2;
  const dia = sfloat(o); o += 2;
  o += 2;
  if (hasTs) o += 7;
  const pulse = hasPr ? sfloat(o) : 0;
  return { sys: isKpa ? (sys * 7.50062).toFixed(0) : sys.toFixed(0), dia: isKpa ? (dia * 7.50062).toFixed(0) : dia.toFixed(0), pulse: pulse.toFixed(0) };
}

export async function connectBLE(type, onUpdate) {
  if (!navigator.bluetooth) { alert('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth (แนะนำ Chrome / Edge)'); return; }
  try {
    if (type === 'bp') {
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['blood_pressure'] });
      const ch = await (await (await dev.gatt.connect()).getPrimaryService('blood_pressure')).getCharacteristic('blood_pressure_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', (ev) => {
        const bp = parseBPData(new DataView(ev.target.value.buffer));
        AppState.vitals.sysDia = bp.sys + '/' + bp.dia;
        if (Number(bp.pulse) > 0) AppState.vitals.pulse = bp.pulse;
        speak('วัดความดันเสร็จสิ้น ความดันโลหิต ' + bp.sys + ' ตัวล่าง ' + bp.dia + ' ชีพจร ' + bp.pulse + ' ครั้งต่อนาทีค่ะ');
        onUpdate('bp');
      });
      AppState.devices.bp = dev.name || 'YUWELL BP'; localStorage.setItem('dev_bp', AppState.devices.bp);
      alert('✅ เชื่อมต่อเครื่องวัดความดันสำเร็จ');
    } else if (type === 'o2') {
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['pulse_oximeter'] });
      const ch = await (await (await dev.gatt.connect()).getPrimaryService('pulse_oximeter')).getCharacteristic('plx_continuous_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', (ev) => {
        AppState.vitals.spo2 = String(ev.target.value.getUint8(1));
        AppState.vitals.pulse = String(ev.target.value.getUint8(3));
        onUpdate('o2');
      });
      AppState.devices.o2 = dev.name || 'Yuwell Oximeter'; localStorage.setItem('dev_o2', AppState.devices.o2);
      alert('✅ เชื่อมต่อเครื่องวัดออกซิเจนสำเร็จ');
    } else if (type === 'weight') {
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [0xA602] });
      const chars = await (await (await dev.gatt.connect()).getPrimaryService(0xA602)).getCharacteristics();
      const wp = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      const nps = chars.filter((c) => c.properties.notify || c.properties.indicate);
      const send = async (b) => { if (!wp) return; try { if (wp.properties.writeWithoutResponse) await wp.writeValueWithoutResponse(b); else await wp.writeValue(b); } catch (e) {} };
      const prof = () => send(new Uint8Array([0xFE, 0x01, 0x01, 0x1E, 0xAA, 0x3E, 0x00, 0x00]));
      for (const c of nps) {
        try {
          await c.startNotifications();
          c.addEventListener('characteristicvaluechanged', (e) => {
            const r = new Uint8Array(e.target.value.buffer);
            if (r.length >= 3 && r[0] === 0 && r[1] === 1) { prof(); return; }
            let w = 0;
            if (r.length >= 12 && r[0] === 0x10) {
              if (r[1] === 0x11 || r.length >= 19) w = ((r[10] << 8) | r[11]) * 0.01;
              else if (r[1] === 0x0a) w = ((r[4] << 8) | r[5]) * 0.01;
            }
            if (w > 5 && w < 300) { AppState.vitals.weight = w.toFixed(2); recalcVitals(); onUpdate('weight'); }
          });
        } catch (e) {}
      }
      await send(new Uint8Array([0xFD, 0x37])); await send(new Uint8Array([0x01, 0x00])); await prof();
      const hb = setInterval(() => send(new Uint8Array([0x00])), 1000);
      dev.addEventListener('gattserverdisconnected', () => clearInterval(hb));
      AppState.devices.weight = dev.name || 'ALLWELL Scale'; localStorage.setItem('dev_weight', AppState.devices.weight);
      alert('✅ เชื่อมต่อเครื่องชั่งน้ำหนักสำเร็จ');
    } else if (type === 'temp') {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Yuwell HT' }], optionalServices: ['health_thermometer'] });
      const ch = await (await (await dev.gatt.connect()).getPrimaryService('health_thermometer')).getCharacteristic('temperature_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', (ev) => {
        const v = ev.target.value;
        const m = v.getUint8(1) | (v.getUint8(2) << 8) | (v.getUint8(3) << 16);
        AppState.vitals.temp = (m * Math.pow(10, v.getInt8(4))).toFixed(1);
        onUpdate('temp');
      });
      AppState.devices.temp = dev.name || 'Yuwell Temp'; localStorage.setItem('dev_temp', AppState.devices.temp);
      alert('✅ เชื่อมต่อเครื่องวัดอุณหภูมิสำเร็จ');
    } else if (type === 'sugar') {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Yuwell Glucose' }], optionalServices: ['glucose'] });
      const ch = await (await (await dev.gatt.connect()).getPrimaryService('glucose')).getCharacteristic('glucose_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', (ev) => {
        AppState.vitals.sugar = String(ev.target.value.getUint16(10, true));
        onUpdate('sugar');
      });
      AppState.devices.sugar = dev.name || 'Yuwell Glucose'; localStorage.setItem('dev_sugar', AppState.devices.sugar);
      alert('✅ เชื่อมต่อเครื่องวัดน้ำตาลสำเร็จ');
    }
    onUpdate('device');
  } catch (err) { console.warn('BLE:', err); }
}

export function formatThaiNow() {
  const d = new Date();
  const th = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return d.getDate() + ' ' + th[d.getMonth()] + ' ' + (d.getFullYear() + 543) + ' เวลา ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0') + ' น.';
}

export async function saveTenantBranding(brandingData) {
  const t = AppState.tenant;
  if (!t || !t.hospcode) return false;
  
  // บันทึกที่ Local เครื่องก่อน
  if (brandingData.custom_logo_url !== undefined) localStorage.setItem('mhs_custom_logo', brandingData.custom_logo_url);
  if (brandingData.custom_video_url !== undefined) localStorage.setItem('mhs_custom_video', brandingData.custom_video_url);
  if (brandingData.custom_hosp_name !== undefined) localStorage.setItem('mhs_custom_hosp_name', brandingData.custom_hosp_name);

  // ส่งขึ้นไปเซฟบน Cloud เพื่อให้เครื่องอื่นเห็นด้วย
  try {
    const res = await cloudFetch('/api/tenant/branding', {
      method: 'POST',
      body: JSON.stringify({
        logo_url: brandingData.custom_logo_url,
        video_url: brandingData.custom_video_url,
        hosp_name: brandingData.custom_hosp_name
      })
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to sync branding to cloud:', err);
    return false;
  }
}

export async function fetchTenantBranding() {
  const t = AppState.tenant;
  if (!t || !t.hospcode) return;
  
  try {
    const res = await cloudFetch('/api/tenant/branding');
    if (res.ok && res.data) {
      const data = res.data.branding || res.data.data || {};
      if (data.logo_url) {
        localStorage.setItem('mhs_custom_logo', data.logo_url);
        AppState.customLogo = data.logo_url;
      }
      if (data.video_url) {
        localStorage.setItem('mhs_custom_video', data.video_url);
        AppState.customVideo = data.video_url;
      }
      if (data.hosp_name) {
        localStorage.setItem('mhs_custom_hosp_name', data.hosp_name);
        AppState.customHospName = data.hosp_name;
      }
    }
  } catch (err) {
    console.error('Failed to fetch branding from cloud:', err);
  }
}

export async function syncBrandingFromConnector() {
  const t = AppState.tenant;
  if (!t || !t.hospcode) return false;
  const base = AppState.cloudUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(base + '/api/public/branding/' + encodeURIComponent(t.hospcode) + '/meta?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return false;
    const d = await res.json().catch(() => null);
    if (!d || !d.success) return false;

    const nextLogo = d.hasLogo && d.logoUrl ? (base + d.logoUrl) : '/logo.png';
    const nextVideo = d.hasVideo && d.videoUrl ? (base + d.videoUrl) : '/bg-video.mp4';
    const nextHosp = d.hospName || '';

    const changed =
      AppState.customLogo !== nextLogo ||
      AppState.customVideo !== nextVideo ||
      AppState.customHospName !== nextHosp;

    AppState.customLogo = nextLogo;
    AppState.customVideo = nextVideo;
    AppState.customHospName = nextHosp;

    if (d.hasLogo && d.logoUrl) localStorage.setItem('custom_logo', nextLogo);
    else localStorage.removeItem('custom_logo');
    if (d.hasVideo && d.videoUrl) localStorage.setItem('custom_video', nextVideo);
    else localStorage.removeItem('custom_video');
    if (nextHosp) localStorage.setItem('custom_hosp_name', nextHosp);
    else localStorage.removeItem('custom_hosp_name');

    return changed;
  } catch (e) {
    return false;
  }
}

export async function uploadBrandingFile(kind, file) {
  const t = AppState.tenant;
  const lic = t && (t.license_key || t.licenseKey || '');
  if (!t || !t.hospcode || !lic) {
    return { ok: false, message: 'ไม่พบ License Key ในเซสชัน กรุณาออกจากสถานบริการแล้วล็อกอินใหม่' };
  }
  const base = AppState.cloudUrl.replace(/\/+$/, '');
  const chunkSize = 400 * 1024; // 400 KB per chunk (ปลอดภัยกับขีดจำกัด 1 MB ของ D1)
  const version = Date.now();
  const totalChunks = Math.ceil(file.size / chunkSize);

  try {
    for (let i = 0; i < totalChunks; i++) {
      const slice = file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize));
      const res = await fetch(
        base + '/api/tenant/branding/chunk?kind=' + encodeURIComponent(kind) + '&version=' + version + '&index=' + i,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-hospcode': String(t.hospcode),
            'x-license-key': String(lic),
          },
          body: slice,
        }
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) {
        return { ok: false, message: d.message || ('อัปโหลดก้อนที่ ' + (i + 1) + '/' + totalChunks + ' ไม่สำเร็จ (HTTP ' + res.status + ')') };
      }
    }

    const commitRes = await cloudFetch('/api/tenant/branding/commit', {
      method: 'POST',
      body: JSON.stringify({
        kind,
        version,
        mime: file.type || (kind === 'logo' ? 'image/png' : 'video/mp4'),
        totalSize: file.size,
        chunkSize,
      }),
    });
    if (!commitRes.ok || !commitRes.data || !commitRes.data.success) {
      return { ok: false, message: (commitRes.data && commitRes.data.message) || 'ยืนยันไฟล์ไม่สำเร็จ' };
    }

    const fullUrl = base + commitRes.data.url;
    if (kind === 'logo') {
      AppState.customLogo = fullUrl;
      localStorage.setItem('custom_logo', fullUrl);
    } else {
      AppState.customVideo = fullUrl;
      localStorage.setItem('custom_video', fullUrl);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'อัปโหลดขึ้น Cloud กลางไม่สำเร็จ: ' + (e.message || e) };
  }
}

export async function saveBrandingMeta(hospName) {
  const r = await cloudFetch('/api/tenant/branding/meta', {
    method: 'POST',
    body: JSON.stringify({ hospName: hospName || '' }),
  });
  return Boolean(r.ok && r.data && r.data.success);
}

export async function resetBrandingOnConnector() {
  const r = await cloudFetch('/api/tenant/branding', { method: 'DELETE' });
  return Boolean(r.ok && r.data && r.data.success);
}
