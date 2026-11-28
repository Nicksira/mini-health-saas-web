import './styles/full-original.css';
import {
  AppState, DEFAULT_CLOUD_URL, DOSE_PRESETS,
  esc, escAttr, getHospDisplay, saveTenantSession, clearTenantSession,
  cloudFetch, jhcisFetch, speak, recalcVitals, analyzeHealth, parseBPData, connectBLE, formatThaiNow
} from './app/engine.js';

const rootEl = document.getElementById('app') || document.getElementById('root') || document.body;
let aiDebounce = null, idleTimer = null, isPollingCard = false, isHuntingBP = false, isSaving = false;

function resetPatientState() {
  AppState.patient = null; AppState.patientImage = null; AppState.activeVisitNo = null;
  AppState.vitals = { height: '', weight: '', waist: '', bmi: '', temp: '', spo2: '', sysDia: '', pulse: '', sugar: '', headCircum: '' };
  AppState.childDev = { nlevel: '3', nlevel2: '3', nlevel3: '4', growdevelop: '1' };
  AppState.sugarFasting = ''; AppState.smokeStatus = ''; AppState.smokeAmount = '1B509'; AppState.smokeWake = ''; AppState.smokeAdvice = '';
  AppState.alcoholStatus = ''; AppState.alcoholAdvice = ''; AppState.customSymptoms = ''; AppState.customSymptomsco = ''; AppState.diagNote = '';
  AppState.timeService = '1'; AppState.foodAllergy = ''; AppState.drugAllergies = []; AppState.icd10List = []; AppState.drugList = [];
  AppState.icdSearch = ''; AppState.icdResults = []; AppState.drugSearch = ''; AppState.drugResults = []; AppState.aiResponse = ''; AppState.patientHistory = [];
}

function sendHeartbeat(status, keepalive) {
  if (!AppState.user || !AppState.tenant || !AppState.tenant.api_url) return;
  try {
    fetch(String(AppState.tenant.api_url).replace(/\/+$/, '') + '/jhcis-api/vhv-heartbeat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': AppState.tenant.api_secret || '' },
      body: JSON.stringify({ cid: AppState.user.cid, status, apiKey: AppState.tenant.api_secret || '' }),
      keepalive: Boolean(keepalive)
    }).catch(() => {});
  } catch (e) {}
}

async function fetchPhoto(cid) {
  try {
    const r = await jhcisFetch('/jhcis-api/photo/' + cid + '?t=' + Date.now());
    AppState.patientImage = (r.ok && r.data && r.data.success && r.data.image) ? ('data:image/jpeg;base64,' + r.data.image) : null;
  } catch (e) { AppState.patientImage = null; }
}

function triggerAI() {
  if (!AppState.vitals.sysDia && !AppState.vitals.weight && !AppState.vitals.sugar) return;
  if (aiDebounce) clearTimeout(aiDebounce);
  aiDebounce = setTimeout(async () => {
    AppState.aiLoading = true; render();
    try {
      const r = await jhcisFetch('/jhcis-api/ai-analyze', { method: 'POST', body: JSON.stringify({ vitals: AppState.vitals }) });
      AppState.aiResponse = (r.data && r.data.message) || 'ประเมินผลเสร็จสิ้น';
      if (AppState.view === 'kiosk') speak(AppState.aiResponse);
    } catch (e) { AppState.aiResponse = 'ไม่สามารถเชื่อมต่อระบบ AI ได้ในขณะนี้'; }
    AppState.aiLoading = false; render();
  }, 1800);
}

function checkCriticalBP() {
  if (!AppState.vitals.sysDia || AppState.vitals.sysDia.indexOf('/') < 0) return;
  const p = AppState.vitals.sysDia.split('/').map(Number);
  if (p[0] >= 180 || p[1] >= 120) {
    AppState.modal = 'emergency';
    speak('อันตราย ความดันโลหิตของคุณสูงถึงขั้นวิกฤต กรุณานั่งพัก และแจ้งเจ้าหน้าที่ทันทีค่ะ');
  }
}

async function loadPatientByCid(cid, cardFallback) {
  const clean = String(cid || '').replace(/\D/g, '');
  if (clean.length !== 13) return { ok: false, msg: 'กรุณากรอกเลขประจำตัวประชาชนให้ครบ 13 หลัก' };
  try {
    const r = await jhcisFetch('/jhcis-api/patient/' + clean);
    if (r.ok && r.data && r.data.success && r.data.data) {
      resetPatientState();
      AppState.patient = Object.assign({}, r.data.data, { cid: clean });
      if (cardFallback && (cardFallback.image || cardFallback.photo)) {
        let s = String(cardFallback.image || cardFallback.photo).trim();
        if (s.indexOf('base64,') >= 0) s = s.split('base64,')[1];
        AppState.patientImage = 'data:image/jpeg;base64,' + s.replace(/\s/g, '');
      }
      await fetchPhoto(clean);
      if (AppState.user && AppState.user.isStaff) {
        jhcisFetch('/jhcis-api/re-med/' + clean).then((rm) => {
          if (rm.ok && rm.data && Array.isArray(rm.data.allergies)) { AppState.drugAllergies = rm.data.allergies; render(); }
        }).catch(() => {});
      }
      return { ok: true };
    }
    return { ok: false, msg: 'ไม่พบข้อมูลผู้ป่วยในระบบ JHCIS กรุณาติดต่อเจ้าหน้าที่' };
  } catch (e) {
    return { ok: false, msg: 'เชื่อมต่อฐานข้อมูล JHCIS ไม่สำเร็จ กรุณาตรวจสอบ Local Connector' };
  }
}

async function fetchTodayQueue() {
  try {
    const r = await jhcisFetch('/jhcis-api/today-queue');
    if (r.ok && r.data && r.data.success) { AppState.todayQueue = r.data.data || []; render(); }
  } catch (e) {}
}

async function loadQueueVisit(visitno, cid) {
  try {
    const [pr, dr] = await Promise.all([
      jhcisFetch('/jhcis-api/patient/' + cid).catch(() => null),
      jhcisFetch('/jhcis-api/visit-detail/' + visitno)
    ]);
    resetPatientState();
    AppState.activeVisitNo = Number(visitno);
    AppState.patient = (pr && pr.ok && pr.data && pr.data.data) ? Object.assign({}, pr.data.data, { cid }) : { cid, fname: '', lname: '' };
    if (dr.ok && dr.data && dr.data.success) {
      const v = dr.data.visit || {};
      AppState.vitals.weight = Number(v.weight) > 0 ? String(v.weight) : '';
      AppState.vitals.height = Number(v.height) > 0 ? String(v.height) : '';
      AppState.vitals.waist = Number(v.waist) > 0 ? String(v.waist) : '';
      AppState.vitals.temp = Number(v.temperature) > 0 ? String(v.temperature) : '';
      AppState.vitals.sysDia = v.pressure ? String(v.pressure) : '';
      AppState.vitals.pulse = Number(v.pulse) > 0 ? String(v.pulse) : '';
      if (v.vitalcheck) {
        const m = String(v.vitalcheck).match(/DTX:\s*([\d.]+)/i);
        if (m) AppState.vitals.sugar = m[1];
        if (String(v.vitalcheck).indexOf('ไม่งดน้ำ-อาหาร') >= 0) AppState.sugarFasting = 'ไม่งดน้ำ-อาหาร';
        else if (String(v.vitalcheck).indexOf('งดน้ำ-อาหาร') >= 0) AppState.sugarFasting = 'งดน้ำ-อาหาร';
      }
      recalcVitals();
      AppState.customSymptoms = v.symptoms || ''; AppState.customSymptomsco = v.symptomsco || '';
      AppState.diagNote = v.diagnote || ''; AppState.timeService = v.timeservice === '2' ? '2' : '1';
      AppState.drugAllergies = dr.data.allergies || [];
      const pp = Array.isArray(dr.data.specialpp) ? dr.data.specialpp : [];
      if (pp.includes('1B52')) AppState.smokeStatus = 'ไม่สูบ';
      else if (pp.includes('1B51')) AppState.smokeStatus = 'เคยสูบแต่เลิกแล้ว';
      else if (pp.some((c) => c.startsWith('1B50'))) {
        AppState.smokeStatus = 'ยังสูบอยู่';
        AppState.smokeAmount = pp.find((c) => ['1B501','1B502','1B503','1B509'].includes(c)) || '1B509';
        AppState.smokeWake = pp.find((c) => ['1B504','1B505','1B506'].includes(c)) || '';
        AppState.smokeAdvice = pp.includes('1B530') ? '1B530' : '';
      }
      if (pp.includes('1B600')) AppState.alcoholStatus = 'ไม่ดื่ม';
      else if (pp.includes('1B601')) AppState.alcoholStatus = 'เคยดื่มแต่เลิกแล้ว';
      else if (pp.includes('1B609')) { AppState.alcoholStatus = 'ยังดื่มอยู่'; AppState.alcoholAdvice = pp.includes('1B611') ? '1B611' : ''; }
      AppState.icd10List = (dr.data.diags || []).map((d) => ({ diagcode: d.diagcode, diseasename: d.diseasename || '', dxtype: d.dxtype || '01', conti: d.conti || '0', appointDate: '' }));
      AppState.drugList = (dr.data.drugs || []).map((d) => ({ drugcode: d.drugcode, drugname: d.drugname, unit: Number(d.unit) || 1, realprice: Number(d.realprice) || 0, costprice: Number(d.costprice) || 0, dose: d.dose || '', recorder: (AppState.user && AppState.user.name) || 'เจ้าหน้าที่' }));
    }
    await fetchPhoto(cid);
    AppState.sidebarMobileOpen = false;
    render();
  } catch (e) { alert('โหลดข้อมูลคิวไม่สำเร็จ'); }
}

async function readSmartcard(silent) {
  if (!AppState.user) {
    if (!silent) { alert('กรุณาลงชื่อเข้าปฏิบัติงาน อสม. หรือเจ้าหน้าที่ก่อนสอดบัตรครับ'); AppState.modal = 'vhv_login'; render(); }
    return;
  }
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('http://localhost:8189/api/smartcard/read?readImageFlag=true', { signal: ctrl.signal });
    clearTimeout(tm);
    const card = await res.json();
    const cid = card && (card.pid || card.citizenId);
    if (!cid) { if (!silent) alert('ไม่พบบัตรประชาชน กรุณาสอดบัตรให้แน่นแล้วลองใหม่'); return; }
    fetch('http://localhost:8189/api/nhso-authen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: cid, claimType: 'PG0060001', mobile: '0000000000', correlationId: 'MiniHealthStation-001' })
    }).catch(() => {});
    const lr = await loadPatientByCid(cid, card);
    if (lr.ok) {
      AppState.view = AppState.user.isStaff ? 'staff' : 'kiosk';
      if (AppState.user.isStaff) fetchTodayQueue();
      render();
    } else if (!silent) alert(lr.msg);
  } catch (e) {
    if (!silent) alert('ไม่สามารถติดต่อเครื่องอ่านบัตรได้ (localhost:8189) กรุณาเปิดแอป JHCIS Card Bridge');
  }
}

function validateBeforeSave() {
  if (!AppState.patient || !AppState.patient.cid) { alert('ไม่พบข้อมูลผู้ป่วย กรุณาค้นหาหรือสอดบัตรก่อน'); return false; }
  const isChild = AppState.patient.age_months != null && Number(AppState.patient.age_months) <= 60;
  const v = AppState.vitals;
  const miss = [];
  if (!v.weight || Number(v.weight) <= 0) miss.push('น้ำหนัก');
  if (!v.height || Number(v.height) <= 0) miss.push('ส่วนสูง');
  if (!isChild) {
    if (!v.waist || Number(v.waist) <= 0) miss.push('รอบเอว');
    if (!v.sysDia) miss.push('ความดันโลหิต');
    if (!v.pulse || Number(v.pulse) <= 0) miss.push('ชีพจร');
    if (Number(v.sugar) > 0 && !AppState.sugarFasting) miss.push('สภาวะก่อนเจาะน้ำตาล');
  }
  if (miss.length) { alert('กรุณากรอกข้อมูลสัญญาณชีพให้ครบ: ' + miss.join(' / ')); return false; }
  if (!isChild && (!AppState.smokeStatus || !AppState.alcoholStatus)) { alert('กรุณาระบุประวัติสูบบุหรี่และประวัติดื่มสุราให้ครบ'); return false; }
  if (!isChild && AppState.user && AppState.user.isStaff && !AppState.customSymptoms.trim()) { alert('กรุณาระบุอาการสำคัญ (CC) ก่อนบันทึก'); return false; }
  return true;
}

async function executeSaveToJHCIS() {
  if (isSaving) return;
  isSaving = true; AppState.modal = null; render();
  const isStaff = Boolean(AppState.user && AppState.user.isStaff);
  const p = AppState.patient;
  const ageY = p.age_months != null ? Math.floor(Number(p.age_months) / 12) : 0;
  const isFemale = p.sex === '2' || p.sex === 'หญิง';
  const payload = {
    visitno: isStaff ? AppState.activeVisitNo : null,
    cid: p.cid, vhv_cid: AppState.user ? AppState.user.cid : null, isStaff,
    customSymptoms: isStaff ? AppState.customSymptoms.trim() : '',
    customSymptomsco: isStaff ? AppState.customSymptomsco.trim() : '',
    serviceType: isStaff ? 'staff_custom' : AppState.serviceType,
    ageMonths: p.age_months, headCircum: parseFloat(AppState.vitals.headCircum) || 0,
    nlevel: AppState.childDev.nlevel, nlevel2: AppState.childDev.nlevel2, nlevel3: AppState.childDev.nlevel3, growdevelop: AppState.childDev.growdevelop,
    diagNote: isStaff ? AppState.diagNote.trim() : '', timeService: isStaff ? AppState.timeService : '1',
    icd10List: isStaff ? AppState.icd10List : [], drugList: isStaff ? AppState.drugList : [],
    smokeStatus: AppState.smokeStatus, alcoholStatus: AppState.alcoholStatus,
    smokeAmount: AppState.smokeAmount, smokeWake: AppState.smokeWake, smokeAdvice: AppState.smokeAdvice, alcoholAdvice: AppState.alcoholAdvice,
    sugarFastingStatus: AppState.sugarFasting, breastCancerScreening: Boolean(isFemale && ageY >= 30 && ageY <= 70),
    weight: parseFloat(AppState.vitals.weight) || 0, height: parseFloat(AppState.vitals.height) || 0,
    sysDia: AppState.vitals.sysDia || '', pulse: parseInt(AppState.vitals.pulse, 10) || 0,
    temp: parseFloat(AppState.vitals.temp) || 0, waist: parseFloat(AppState.vitals.waist) || 0,
    sugarText: AppState.vitals.sugar ? ('น้ำตาลในเลือด ' + AppState.vitals.sugar) : '', sugar: AppState.vitals.sugar || ''
  };
  try {
    const r = await jhcisFetch('/jhcis-api/queue', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    isSaving = false;
    if (isStaff) {
      if (r.data && r.data.visitno) AppState.activeVisitNo = r.data.visitno;
      await fetchTodayQueue();
      alert('✅ บันทึกเข้า JHCIS สำเร็จ! (SEQ ' + (AppState.activeVisitNo || '') + ')');
      render();
    } else {
      speak('บันทึกข้อมูลและจัดคิวเข้าสู่ระบบสำเร็จ ขอบคุณที่ใช้บริการค่ะ');
      AppState.ratingScore = 5; AppState.modal = 'rating'; render();
    }
  } catch (err) {
    isSaving = false;
    AppState.offlineQueue.push(Object.assign({}, payload, { name: (p.fname || '') + ' ' + (p.lname || ''), timestamp: new Date().toLocaleString('th-TH') }));
    localStorage.setItem('offline_queue', JSON.stringify(AppState.offlineQueue));
    speak('การเชื่อมต่อขัดข้อง แต่ระบบได้บันทึกข้อมูลสำรองไว้ในเครื่องแล้วค่ะ');
    alert('💾 อินเทอร์เน็ตขัดข้อง: บันทึกสำรองไว้ในคิวออฟไลน์แล้ว (' + AppState.offlineQueue.length + ' รายการ)');
    render();
  }
}

function handlePhotoUploadFile(file) {
  if (!file || !AppState.patient || !AppState.patient.cid) return;
  const rd = new FileReader();
  rd.onloadend = () => {
    const img = new Image();
    img.src = rd.result;
    img.onload = async () => {
      const c = document.createElement('canvas');
      const sc = 600 / img.width;
      c.width = 600; c.height = img.height * sc;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const b64 = c.toDataURL('image/jpeg', 0.7);
      AppState.patientImage = b64; render();
      try {
        const r = await jhcisFetch('/jhcis-api/upload-photo', { method: 'POST', body: JSON.stringify({ cid: AppState.patient.cid, image: b64 }) });
        alert(r.ok && r.data && r.data.success ? '📸 บันทึกรูปภาพลง JHCIS สำเร็จ!' : '❌ บันทึกรูปไม่สำเร็จ');
      } catch (e) { alert('❌ อัปโหลดรูปไม่สำเร็จ'); }
    };
  };
  rd.readAsDataURL(file);
}

// ==================== RENDERERS ====================
function renderTenantLogin() {
  return [
    '<div class="tl-stage">',
    '  <video class="tl-video" autoplay loop muted playsinline><source src="' + escAttr(AppState.customVideo) + '" type="video/mp4" /></video>',
    '  <div class="tl-card">',
    '    <div style="text-align:center;margin-bottom:18px;">',
    '      <img src="' + escAttr(AppState.customLogo) + '" style="height:74px;max-width:260px;object-fit:contain;" onerror="this.style.display=\'none\'" />',
    '      <h1 class="aurora-text" style="font-size:30px;">Mini Health Station</h1>',
    '      <p style="margin:4px 0 0;color:#64748b;font-size:14px;">เข้าสู่ระบบสถานบริการ (Multi-Tenant SaaS)</p>',
    '    </div>',
    '    <form id="frmTenantLogin">',
    '      <input type="hidden" id="tlCloudUrl" value="' + escAttr(AppState.cloudUrl) + '" />',
    '      <div class="tl-field"><label>รหัสสถานบริการ 5 หลัก (hospcode)</label><input id="tlHosp" maxlength="5" required placeholder="เช่น 12345" /></div>',
    '      <div class="tl-field"><label>License Key</label><input id="tlKey" required placeholder="MHS-XXXXX-XXXX-XXXX" /></div>',
    '      <div id="tlErr" style="color:#dc2626;font-size:13.5px;font-weight:700;min-height:20px;margin-bottom:10px;"></div>',
    '      <button type="submit" class="btn-full" style="background:linear-gradient(135deg,#0d9488,#0284c7);font-size:16px;">ตรวจสอบ License และเข้าใช้งาน</button>',
    '    </form>',
    '  </div>',
    '</div>'
  ].join('');
}

function renderTopHeader() {
  const u = AppState.user;
  return [
    '<header class="header-bg">',
    '  <div class="header-logo"><img src="' + escAttr(AppState.customLogo) + '" alt="โลโก้หน่วยงาน" data-act="logo-secret" /></div>',
    '  <h1 class="aurora-text">Mini Health Station</h1>',
    '  <div class="header-hosp">' + esc(getHospDisplay()) + '</div>',
    '  <div class="vhv-status-wrap">',
    u
      ? '<div class="vhv-badge ' + (u.isStaff ? 'staff' : '') + '"><span class="online-dot"></span><i class="fa-solid ' + (u.isStaff ? 'fa-user-doctor' : 'fa-user-nurse') + '"></i><span>' + (u.isStaff ? 'เจ้าหน้าที่: ' : 'อสม.: ') + esc(u.name) + '</span><button type="button" class="btn-badge-out" data-act="user-logout">ออก</button></div>'
      : '<button type="button" class="btn-vhv-login" data-act="open-vhv-login"><i class="fa-solid fa-user-nurse"></i> อสม. ลงชื่อเข้าปฏิบัติงาน</button>',
    '  </div>',
    '</header>'
  ].join('');
}

function renderHomeScreen() {
  return [
    '<div class="app-container">',
    renderTopHeader(),
    '  <main class="home-screen">',
    '    <video class="home-video" autoplay loop muted playsinline><source src="' + escAttr(AppState.customVideo) + '" type="video/mp4" /></video>',
    '    <div class="home-center">',
    '      <button type="button" class="nick-card-btn" data-act="read-card" title="แตะเพื่ออ่านบัตรประชาชน"><img src="/nick.png" alt="กรุณาสอดบัตรประชาชน" /></button>',
    '      <div class="instruction-text">กรุณาสอดบัตรประชาชน เพื่อเข้ารับบริการ</div>',
    '      <button type="button" class="btn-no-card" data-act="open-manual-cid">ไม่มีบัตรประชาชนแตะที่ปุ่มนี้</button>',
    (AppState.user && AppState.user.isStaff)
      ? '<button type="button" class="btn-open-staff" data-act="go-staff"><i class="fa-solid fa-user-doctor"></i> เปิดโต๊ะตรวจเจ้าหน้าที่ (ดูคิว JHCIS วันนี้)</button>'
      : '',
    '    </div>',
    '  </main>',
    '  <button type="button" class="bt-fab-circle" data-act="open-bt" title="จัดการอุปกรณ์ Bluetooth"><i class="fa-brands fa-bluetooth-b"></i></button>',
    '</div>'
  ].join('');
}

function renderVhvKiosk() {
  const p = AppState.patient || {};
  const v = AppState.vitals;
  const isChild = p.age_months != null && Number(p.age_months) <= 60;
  const ha = analyzeHealth();

  const vitalCells = [
    ['height', 'ส่วนสูง', 'เซนติเมตร', v.height],
    ['weight', 'น้ำหนัก', 'กิโลกรัม', v.weight],
    ['waist', 'รอบเอว', 'เซนติเมตร', v.waist],
    ['bmi', 'ดัชนีมวลกาย', 'กิโลกรัม/เมตร²', v.bmi],
    ['temp', 'อุณหภูมิ', 'องศาเซลเซียส', v.temp],
    ['spo2', 'O₂ sat', '%', v.spo2],
    ['sysDia', 'ความดันโลหิต', 'มิลลิเมตร/ปรอท', v.sysDia],
    ['pulse', 'ชีพจร', 'ครั้ง/นาที', v.pulse],
    ['sugar', 'น้ำตาลในเลือด', 'มิลลิกรัม/เดซิลิตร', v.sugar]
  ];

  return [
    '<div class="app-container">',
    renderTopHeader(),
    '  <button type="button" class="top-left-back" data-act="kiosk-home"><i class="fa-solid fa-chevron-left"></i> กลับหน้าแรก</button>',
    '  <div class="dashboard-scroll"><div class="dashboard-wrap">',
    '    <div class="patient-header-card">',
    '      <h2>ยินดีต้อนรับ คุณ' + esc(p.fname || '-') + ' ' + esc(p.lname || '') + '</h2>',
    '      <div class="realtime-clock" id="liveThaiClock">' + esc(formatThaiNow()) + '</div>',
    '      <div style="font-size:16px;opacity:0.95;">กรุณาเลือกรายการที่ท่านต้องการตรวจวัด</div>',
    '    </div>',
    '    <div class="photo-container"><div class="photo-box">',
    AppState.patientImage
      ? '<img src="' + AppState.patientImage + '" class="patient-photo-real" alt="รูปผู้ป่วย" />'
      : '<div class="patient-photo-placeholder"><i class="fa-solid fa-user"></i></div>',
    '      <label class="cam-fab" title="ถ่ายรูปใหม่"><i class="fa-solid fa-camera"></i><input type="file" id="inpPhotoUpload" accept="image/*" capture="user" style="display:none;" /></label>',
    '    </div></div>',

    '    <div class="device-buttons">',
    '      <button type="button" class="btn-device" data-guide="o2">อ๊อกซิเจนในเลือด <i class="fa-regular fa-hand-point-up" style="color:#eab308;"></i></button>',
    '      <button type="button" class="btn-device" data-guide="weight">ชั่งน้ำหนัก <i class="fa-solid fa-weight-scale" style="color:#10b981;"></i></button>',
    '      <button type="button" class="btn-device" data-guide="temp">วัดอุณหภูมิ <i class="fa-solid fa-temperature-low" style="color:#f97316;"></i></button>',
    '      <button type="button" class="btn-device" data-guide="bp">วัดความดันฯ <i class="fa-solid fa-gauge-high" style="color:#38bdf8;"></i></button>',
    '      <button type="button" class="btn-device" data-guide="sugar">น้ำตาลในเลือด <i class="fa-solid fa-droplet" style="color:#ef4444;"></i></button>',
    '    </div>',

    isChild ? [
      '    <div class="kiosk-card" style="background:#fef3c7;border:2px dashed #f59e0b;">',
      '      <h3 style="margin:0 0 16px;color:#d97706;text-align:center;"><i class="fa-solid fa-baby"></i> ข้อมูลโภชนาการเด็ก (อายุ ' + esc(p.age_months) + ' เดือน)</h3>',
      '      <div class="vitals-grid">',
      [['weight','น้ำหนัก','กิโลกรัม',v.weight],['height','ส่วนสูง','เซนติเมตร',v.height],['headCircum','เส้นรอบศีรษะ','เซนติเมตร',v.headCircum]].map((it) =>
        '<div class="vital-cell" style="background:#fff;border-color:#fcd34d;"><div class="vital-label">' + it[1] + '<br/><small>' + it[2] + '</small></div><div class="vital-value-box"><input data-vital="' + it[0] + '" value="' + escAttr(it[3]) + '" placeholder="---" /></div></div>'
      ).join(''),
      '      </div>',
      '      <div style="background:#fff;padding:12px;border-radius:10px;font-size:14px;color:#b45309;"><strong>เกณฑ์โภชนาการ JHCIS อัตโนมัติ:</strong> นน./อายุ=' + AppState.childDev.nlevel + ' · สส./อายุ=' + AppState.childDev.nlevel2 + ' · นน./สส.=' + AppState.childDev.nlevel3 + '</div>',
      '    </div>'
    ].join('') : [
      '    <div class="kiosk-card">',
      '      <div class="service-grid">',
      '        <button type="button" class="service-btn ' + (AppState.serviceType === 'health_station' ? 'active-hs' : '') + '" data-svc="health_station"><i class="fa-solid fa-house-chimney-medical" style="font-size:28px;"></i><strong style="font-size:18px;">Health Station</strong><small>ผู้ป่วย NCD กลุ่มสีเขียว</small></button>',
      '        <button type="button" class="service-btn ' + (AppState.serviceType === 'screening' ? 'active-sc' : '') + '" data-svc="screening"><i class="fa-solid fa-magnifying-glass-chart" style="font-size:28px;"></i><strong style="font-size:18px;">คัดกรอง</strong><small>เบาหวาน-ความดัน 35 ปีขึ้นไป</small></button>',
      '      </div>',
      '      <div class="jhcis-preview-box"><strong>ข้อความที่จะบันทึกเข้า JHCIS:</strong> ' + (AppState.serviceType === 'screening' ? 'คัดกรอง เบาหวาน-ความดันโลหิตสูง อายุ 35 ปี ขึ้นไป' : 'ผู้ป่วย NCD กลุ่มสีเขียว รับบริการที่ health station ประจำหมู่บ้าน โดย อสม.') + '</div>',
      '      <div class="vitals-grid">' + vitalCells.map((it) =>
        '<div class="vital-cell"><div class="vital-label">' + it[1] + '<br/><small>' + it[2] + '</small>' +
        (it[0] === 'sugar' && AppState.sugarFasting ? '<br/><span class="fasting-badge" data-act="open-fasting">' + esc(AppState.sugarFasting) + ' <i class="fa-solid fa-pen"></i></span>' : '') +
        '</div><div class="vital-value-box"><input data-vital="' + it[0] + '" value="' + escAttr(it[3]) + '" placeholder="---" ' + (it[0] === 'bmi' ? 'readonly' : '') + ' /></div></div>'
      ).join('') + '</div>',
      '      <div class="risk-grid">',
      '        <div class="risk-box">',
      '          <div style="font-weight:700;text-align:center;margin-bottom:10px;"><i class="fa-solid fa-smoking"></i> ประวัติสูบบุหรี่</div>',
      '          <select data-bind="smokeStatus"><option value="">-- กรุณาเลือก --</option><option value="ไม่สูบ" ' + (AppState.smokeStatus==='ไม่สูบ'?'selected':'') + '>ไม่สูบ</option><option value="เคยสูบแต่เลิกแล้ว" ' + (AppState.smokeStatus==='เคยสูบแต่เลิกแล้ว'?'selected':'') + '>เคยสูบแต่เลิกแล้ว</option><option value="ยังสูบอยู่" ' + (AppState.smokeStatus==='ยังสูบอยู่'?'selected':'') + '>ยังสูบอยู่</option></select>',
      AppState.smokeStatus === 'ยังสูบอยู่' ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">' +
        '<select data-bind="smokeAmount"><option value="1B509" ' + (AppState.smokeAmount==='1B509'?'selected':'') + '>-- ปริมาณ: ไม่ระบุ --</option><option value="1B501" ' + (AppState.smokeAmount==='1B501'?'selected':'') + '>1-10 มวน/วัน</option><option value="1B502" ' + (AppState.smokeAmount==='1B502'?'selected':'') + '>11-19 มวน/วัน</option><option value="1B503" ' + (AppState.smokeAmount==='1B503'?'selected':'') + '>20 มวนขึ้นไป/วัน</option></select>' +
        '<select data-bind="smokeWake"><option value="" ' + (!AppState.smokeWake?'selected':'') + '>-- สูบหลังตื่นนอน: ไม่ระบุ --</option><option value="1B504" ' + (AppState.smokeWake==='1B504'?'selected':'') + '>น้อยกว่า 30 นาที</option><option value="1B505" ' + (AppState.smokeWake==='1B505'?'selected':'') + '>30 นาที - 1 ชม.</option><option value="1B506" ' + (AppState.smokeWake==='1B506'?'selected':'') + '>1 ชม. ขึ้นไป</option></select>' +
        '<select data-bind="smokeAdvice"><option value="" ' + (!AppState.smokeAdvice?'selected':'') + '>-- คำปรึกษา: ไม่ระบุ --</option><option value="1B530" ' + (AppState.smokeAdvice==='1B530'?'selected':'') + '>ให้คำแนะนำสั้นๆ (1B530)</option></select></div>' : '',
      '        </div>',
      '        <div class="risk-box">',
      '          <div style="font-weight:700;text-align:center;margin-bottom:10px;"><i class="fa-solid fa-wine-glass"></i> ประวัติดื่มสุรา</div>',
      '          <select data-bind="alcoholStatus"><option value="">-- กรุณาเลือก --</option><option value="ไม่ดื่ม" ' + (AppState.alcoholStatus==='ไม่ดื่ม'?'selected':'') + '>ไม่ดื่ม</option><option value="เคยดื่มแต่เลิกแล้ว" ' + (AppState.alcoholStatus==='เคยดื่มแต่เลิกแล้ว'?'selected':'') + '>เคยดื่มแต่เลิกแล้ว</option><option value="ยังดื่มอยู่" ' + (AppState.alcoholStatus==='ยังดื่มอยู่'?'selected':'') + '>ยังดื่มอยู่</option></select>',
      AppState.alcoholStatus === 'ยังดื่มอยู่' ? '<div style="margin-top:10px;"><select data-bind="alcoholAdvice"><option value="" ' + (!AppState.alcoholAdvice?'selected':'') + '>-- คำปรึกษา: ไม่ระบุ --</option><option value="1B611" ' + (AppState.alcoholAdvice==='1B611'?'selected':'') + '>การให้คำปรึกษาแบบสั้นๆ (1B611)</option></select></div>' : '',
      '        </div>',
      '      </div>',
      '    </div>'
    ].join(''),

    '    <div class="kiosk-card">',
    '      <div style="font-size:18px;font-weight:700;border-bottom:2px solid #eee;padding-bottom:10px;margin-bottom:14px;"><i class="fa-solid fa-stethoscope" style="color:#38bdf8;margin-right:8px;"></i>ผลการประเมินภาวะสุขภาพ</div>',
    '      <div style="display:flex;align-items:center;gap:14px;padding:14px;background:#f8fafc;border-radius:12px;margin-bottom:10px;">',
    '        <i class="fa-solid fa-notes-medical" style="font-size:28px;color:#64748b;"></i>',
    '        <div><div style="font-weight:700;color:#475569;">โรคประจำตัว</div><div style="font-weight:700;color:' + ((!p.chronic || p.chronic === 'ไม่มีโรคประจำตัว') ? '#059669' : '#dc2626') + ';">' + esc(p.chronic || 'ไม่มีโรคประจำตัว') + '</div></div>',
    '      </div>',
    (v.sysDia || v.weight || v.sugar) ? '<div style="display:flex;align-items:flex-start;gap:14px;padding:14px;background:#eff6ff;border-radius:12px;margin-bottom:10px;"><i class="fa-solid ' + (AppState.aiLoading ? 'fa-spinner fa-spin' : 'fa-user-doctor') + '" style="font-size:28px;color:#3b82f6;"></i><div><div style="font-weight:700;color:#1d4ed8;">AI พยาบาลประเมินว่า:</div><div style="font-size:14.5px;font-weight:600;color:#334155;">' + esc(AppState.aiLoading ? 'กำลังวิเคราะห์ข้อมูลสุขภาพ...' : (AppState.aiResponse || 'กรุณาวัดค่าเพื่อประเมิน')) + '</div></div></div>' : '',
    ha.alerts.map((a) => '<div style="display:flex;align-items:flex-start;gap:12px;padding:13px;background:' + a.color + '15;border-radius:12px;margin-bottom:10px;"><i class="fa-solid ' + a.icon + '" style="font-size:26px;color:' + a.color + ';"></i><div><strong style="color:' + a.color + ';">' + esc(a.title) + '</strong><div style="font-size:14px;">' + esc(a.desc) + '</div></div></div>').join(''),
    '      <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px;">',
    ha.isEmergency ? '<a href="tel:1669" class="btn-full" style="background:#ef4444;"><i class="fa-solid fa-truck-medical"></i> โทรเรียก 1669 ทันที!</a>' : '',
    '        <button type="button" class="btn-full" style="background:#10b981;" data-act="kiosk-save"><i class="fa-solid fa-server"></i> บันทึกข้อมูลและจัดคิวลง JHCIS</button>',
    '        <button type="button" class="btn-full" style="background:#0284c7;" data-act="open-telemed"><i class="fa-solid fa-video"></i> ปรึกษาแพทย์ออนไลน์ (Telemedicine)</button>',
    '        <button type="button" class="btn-full" style="background:#64748b;" data-act="open-manual-cid"><i class="fa-solid fa-user-plus"></i> ค้นหาผู้ป่วยรายใหม่</button>',
    '      </div>',
    '    </div>',
    '  </div></div>',
    '  <button type="button" class="bt-fab-circle" data-act="open-bt"><i class="fa-brands fa-bluetooth-b"></i></button>',
    '</div>'
  ].join('');
}

function renderStaffWorkspace() {
  const p = AppState.patient;
  const v = AppState.vitals;
  const isChild = p && p.age_months != null && Number(p.age_months) <= 60;
  const waitList = AppState.todayQueue.filter((r) => Number(r.diag_count || 0) === 0 && Number(r.drug_count || 0) === 0);
  const doneList = AppState.todayQueue.filter((r) => Number(r.diag_count || 0) > 0 || Number(r.drug_count || 0) > 0);
  const qRows = (AppState.queueFilter === 'waiting' ? waitList : doneList).filter((r) => {
    const q = AppState.queueSearch.trim().toLowerCase();
    if (!q) return true;
    return ((r.fname || '') + ' ' + (r.lname || '') + ' ' + (r.cid || '') + ' ' + (r.visitno || '') + ' ' + (r.pid || '')).toLowerCase().includes(q);
  });
  const totalSell = AppState.drugList.reduce((s, d) => s + d.unit * d.realprice, 0);
  const totalCost = AppState.drugList.reduce((s, d) => s + d.unit * d.costprice, 0);
  const bpParts = (v.sysDia || '').split('/').map(Number);
  const bpDot = (!bpParts[0] || !bpParts[1]) ? 'blue' : (bpParts[0] >= 140 || bpParts[1] >= 90) ? 'red' : (bpParts[0] >= 130 || bpParts[1] >= 85) ? 'orange' : 'green';
  const bmiNum = parseFloat(v.bmi);
  const bmiLbl = isNaN(bmiNum) ? '' : bmiNum < 18.5 ? 'น้ำหนักน้อย' : bmiNum < 23 ? 'ปกติ' : bmiNum < 25 ? 'ท้วม' : 'อ้วน';
  const ageText = p && p.age_months != null ? (Math.floor(p.age_months / 12) + ' ปี ' + (p.age_months % 12) + ' เดือน') : '-';
  const ha = analyzeHealth();

  return [
    '<div class="ios-ws-root">',
    AppState.sidebarMobileOpen ? '<div class="ios-sidebar-backdrop" data-act="close-mob-sb"></div>' : '',
    '  <aside class="ios-sidebar ' + (AppState.sidebarCollapsed ? 'collapsed' : '') + ' ' + (AppState.sidebarMobileOpen ? 'open-mob' : '') + '">',
    '    <div class="ios-sidebar-header">',
    '      <div class="ios-sidebar-toprow">',
    '        <div><div class="ios-hosp-label">' + esc(getHospDisplay().replace('โรงพยาบาลส่งเสริมสุขภาพตำบล', 'รพ.สต.')) + '</div><h2 class="ios-sidebar-title">คิวตรวจวันนี้</h2></div>',
    '        <div style="display:flex;gap:6px;"><button type="button" class="ios-circle-btn" data-act="refresh-queue" title="รีเฟรชคิว"><i class="fa-solid fa-rotate"></i></button><button type="button" class="ios-circle-btn" data-act="open-manual-cid" title="ค้นหา 13 หลัก"><i class="fa-solid fa-plus"></i></button></div>',
    '      </div>',
    '      <div style="position:relative;"><i class="fa-solid fa-magnifying-glass" style="position:absolute;left:11px;top:11px;color:#94a3b8;font-size:13px;"></i><input class="ios-search-input" data-bind="queueSearch" value="' + escAttr(AppState.queueSearch) + '" placeholder="ค้นหาชื่อ, SEQ หรือ ปชช." /></div>',
    '      <div class="ios-segmented">',
    '        <button type="button" class="ios-seg-btn ' + (AppState.queueFilter === 'waiting' ? 'active' : '') + '" data-qtab="waiting">รอตรวจ ' + waitList.length + '</button>',
    '        <button type="button" class="ios-seg-btn ' + (AppState.queueFilter === 'done' ? 'active' : '') + '" data-qtab="done">ตรวจแล้ว ' + doneList.length + '</button>',
    '      </div>',
    '    </div>',
    '    <div class="ios-queue-list">',
    qRows.length === 0 ? '<div style="text-align:center;padding:34px 10px;font-size:13px;color:#94a3b8;">ยังไม่มีผู้รับบริการในรายการนี้</div>' : qRows.map((row) => {
      const act = AppState.activeVisitNo === Number(row.visitno) || (!AppState.activeVisitNo && p && p.cid === row.cid);
      const ini = ((row.fname || '').charAt(0) + (row.lname || '').charAt(0)) || 'ผ';
      return '<button type="button" class="ios-queue-item ' + (act ? 'active' : '') + '" data-qvisit="' + row.visitno + '" data-qcid="' + escAttr(row.cid) + '">' +
        '<div class="ios-queue-avatar">' + esc(ini) + '</div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:center;"><strong style="font-size:14px;">' + esc((row.fname || '') + ' ' + (row.lname || '')) + '</strong>' + (Number(row.allergy_count || 0) > 0 ? '<span class="ios-dot" style="background:' + (act ? '#FFD60A' : '#FF3B30') + ';"></span>' : '') + '</div><div class="ios-queue-meta">SEQ ' + row.visitno + ' · ' + esc(row.pressure ? ('BP ' + row.pressure) : (row.symptoms || 'รอซักประวัติ')) + '</div></div></button>';
    }).join(''),
    '    </div>',
    '    <div class="ios-sidebar-footer"><div style="display:flex;align-items:center;gap:7px;"><span class="ios-dot green"></span><strong>' + esc((AppState.user && AppState.user.name) || 'เจ้าหน้าที่') + '</strong></div><span id="staffClock" style="font-family:monospace;">' + new Date().toTimeString().slice(0, 8) + '</span></div>',
    '  </aside>',

    '  <div class="ios-main-col">',
    '    <header class="ios-navbar"><div class="ios-navbar-inner">',
    '      <div style="display:flex;align-items:center;gap:8px;"><button type="button" class="ios-nav-btn" data-act="toggle-sb"><i class="fa-solid fa-table-columns"></i></button><div id="compactTitle" style="opacity:0;transition:0.2s;font-size:14px;font-weight:700;">' + esc(p ? ((p.fname || '') + ' ' + (p.lname || '')) : '') + '</div></div>',
    '      <div class="ios-segmented" style="min-width:270px;">',
    '        <button type="button" class="ios-seg-btn ' + (AppState.staffTab === 'visit' ? 'active' : '') + '" data-stab="visit">ตรวจรักษา</button>',
    '        <button type="button" class="ios-seg-btn ' + (AppState.staffTab === 'history' ? 'active' : '') + '" data-stab="history">ประวัติ</button>',
    '        <button type="button" class="ios-seg-btn ' + (AppState.staffTab === 'screening' ? 'active' : '') + '" data-stab="screening">คัดกรอง &amp; AI</button>',
    '      </div>',
    '      <div style="display:flex;align-items:center;gap:4px;position:relative;">',
    '        <button type="button" class="ios-nav-btn" data-act="open-bt"><i class="fa-brands fa-bluetooth-b"></i></button>',
    '        <button type="button" class="ios-nav-btn" data-act="open-telemed"><i class="fa-solid fa-video"></i></button>',
    '        <button type="button" class="ios-nav-btn" data-act="toggle-more"><i class="fa-solid fa-ellipsis-vertical"></i></button>',
    AppState.showMoreMenu ? '<div class="ios-popover"><button type="button" class="ios-popover-item" data-act="read-card"><span>อ่านบัตรประชาชนใหม่</span><i class="fa-solid fa-id-card" style="color:#007AFF;"></i></button><button type="button" class="ios-popover-item" data-act="open-manual-cid"><span>ค้นหาด้วยเลข 13 หลัก</span><i class="fa-solid fa-magnifying-glass" style="color:#007AFF;"></i></button><button type="button" class="ios-popover-item" data-act="refresh-queue"><span>รีเฟรชคิว JHCIS วันนี้</span><i class="fa-solid fa-rotate" style="color:#34C759;"></i></button><button type="button" class="ios-popover-item danger" data-act="staff-home"><span>กลับหน้าแรก Kiosk</span><i class="fa-solid fa-right-from-bracket"></i></button></div>' : '',
    '        <button type="button" class="ios-save-btn" data-act="staff-save" ' + (!p ? 'disabled' : '') + '>บันทึก</button>',
    '      </div>',
    '    </div></header>',

    '    <main class="ios-main-scroll" id="staffScroll">',
    !p ? [
      '      <div style="max-width:480px;margin:90px auto;text-align:center;padding:24px;">',
      '        <div style="font-size:46px;color:#007AFF;margin-bottom:10px;"><i class="fa-solid fa-user-doctor"></i></div>',
      '        <h2 style="margin:0 0 8px;">เลือกผู้รับบริการจากแถบคิวด้านซ้าย</h2>',
      '        <p style="color:#64748b;margin-bottom:20px;">หรือสอดบัตรประชาชน / กดค้นหาเลข 13 หลัก เพื่อเริ่มบันทึกการตรวจลง JHCIS</p>',
      '        <div style="display:flex;justify-content:center;gap:10px;"><button type="button" class="ios-save-btn" data-act="open-manual-cid"><i class="fa-solid fa-magnifying-glass"></i> ค้นหาเลข 13 หลัก</button><button type="button" class="ios-pill blue" data-act="read-card"><i class="fa-solid fa-id-card"></i> อ่านบัตรประชาชน</button></div>',
      '      </div>'
    ].join('') : [
      '      <div class="ios-canvas">',
      '        <div class="ios-patient-header">',
      '          <div style="display:flex;align-items:center;gap:14px;">',
      '            <label class="ios-avatar-lg" title="แตะถ่ายรูปผู้ป่วยใหม่">' + (AppState.patientImage ? '<img src="' + AppState.patientImage + '" />' : esc(((p.fname || '').charAt(0) + (p.lname || '').charAt(0)) || 'ผ')) + '<input type="file" id="inpPhotoUpload" accept="image/*" capture="user" style="display:none;" /></label>',
      '            <div><h1 style="margin:0;font-size:25px;">' + esc((p.fname || '') + ' ' + (p.lname || '')) + '</h1><div style="font-size:13.5px;color:#64748b;">' + (AppState.activeVisitNo ? ('SEQ ' + AppState.activeVisitNo + ' · ') : 'Visit ใหม่ · ') + 'CID ' + esc(p.cid) + ' · อายุ ' + ageText + '</div></div>',
      '          </div>',
      '          <div style="display:flex;gap:8px;flex-wrap:wrap;">',
      '            <button type="button" class="ios-pill ' + ((AppState.drugAllergies.length || AppState.foodAllergy) ? 'danger' : '') + '" data-modal="sheet_allergy"><span class="ios-dot ' + ((AppState.drugAllergies.length || AppState.foodAllergy) ? 'red' : 'green') + '"></span>' + (AppState.drugAllergies.length ? ('แพ้ยา ' + AppState.drugAllergies.length + ' รายการ') : 'ไม่พบประวัติแพ้ยา') + '</button>',
      '            <button type="button" class="ios-pill blue" data-act="toggle-time">' + (AppState.timeService === '1' ? 'ในเวลา' : 'นอกเวลา') + '</button>',
      '          </div>',
      '        </div>',

      '        <div class="ios-pill-row">',
      '          <button type="button" class="ios-pill" data-act="re-med"><i class="fa-solid fa-rotate-left" style="color:#007AFF;"></i> ดึงยาเดิม (Re Med)</button>',
      '          <button type="button" class="ios-pill" data-preset="symptoms"><i class="fa-solid fa-list-ul" style="color:#4f46e5;"></i> คลังข้อความ CC</button>',
      '          <button type="button" class="ios-pill" data-preset="symptomsco"><i class="fa-solid fa-notes-medical" style="color:#0284c7;"></i> คลังข้อความ PI</button>',
      '          <button type="button" class="ios-pill" data-guide="bp"><i class="fa-solid fa-gauge-high" style="color:#007AFF;"></i> วัดความดัน BLE</button>',
      '          <button type="button" class="ios-pill" data-guide="weight"><i class="fa-solid fa-weight-scale" style="color:#34C759;"></i> ชั่งน้ำหนัก BLE</button>',
      '          <button type="button" class="ios-pill" data-guide="sugar"><i class="fa-solid fa-droplet" style="color:#FF3B30;"></i> เจาะน้ำตาล</button>',
      '        </div>',

      AppState.staffTab === 'visit' ? [
        isChild ? '<section><div class="ios-section-head"><h2 class="ios-section-title">โภชนาการเด็ก 0–60 เดือน (' + esc(p.age_months) + ' เดือน)</h2></div><div class="ios-card"><div class="ios-vitals-grid" style="grid-template-columns:repeat(3,1fr);"><div class="ios-vital-box"><span class="ios-vital-label">น้ำหนัก (กก.)</span><input class="ios-vital-num" data-vital="weight" value="' + escAttr(v.weight) + '" placeholder="---" /></div><div class="ios-vital-box"><span class="ios-vital-label">ส่วนสูง (ซม.)</span><input class="ios-vital-num" data-vital="height" value="' + escAttr(v.height) + '" placeholder="---" /></div><div class="ios-vital-box"><span class="ios-vital-label">รอบศีรษะ (ซม.)</span><input class="ios-vital-num" data-vital="headCircum" value="' + escAttr(v.headCircum) + '" placeholder="---" /></div></div></div></section>'
        : [
          '<section><div class="ios-section-head"><h2 class="ios-section-title">อาการและผลตรวจร่างกาย</h2><button type="button" class="ios-link-btn" data-act="fill-ga">เติม GA+ ปกติ</button></div><div class="ios-card">',
          '  <div class="ios-row"><label class="ios-row-label">อาการสำคัญ (CC) <span style="color:#FF3B30;">*</span></label><input class="ios-field-input" data-bind="customSymptoms" value="' + escAttr(AppState.customSymptoms) + '" placeholder="ระบุอาการสำคัญ..." /><button type="button" class="ios-link-btn" data-preset="symptoms">เลือกข้อความ</button></div>',
          '  <div class="ios-row"><label class="ios-row-label">อาการร่วม (PI)</label><input class="ios-field-input" data-bind="customSymptomsco" value="' + escAttr(AppState.customSymptomsco) + '" placeholder="ประวัติเจ็บป่วยปัจจุบัน..." /><button type="button" class="ios-link-btn" data-preset="symptomsco">เลือกข้อความ</button></div>',
          '  <div class="ios-row" style="align-items:flex-start;"><label class="ios-row-label">ผลตรวจ / คำวินิจฉัย</label><textarea rows="2" class="ios-field-textarea" data-bind="diagNote" placeholder="GA: Alert, HEENT: Not pale...">' + esc(AppState.diagNote) + '</textarea></div>',
          '</div></section>',

          '<section><div class="ios-section-head"><h2 class="ios-section-title">สัญญาณชีพ &amp; สัดส่วนร่างกาย</h2><button type="button" class="ios-link-btn" data-guide="bp">อ่านจากเครื่องวัดความดัน</button></div><div class="ios-card">',
          '  <div class="ios-vitals-grid">',
          '    <div class="ios-vital-box"><div class="ios-vital-label"><span>ความดัน (mmHg)</span><span class="ios-dot ' + bpDot + '"></span></div><input class="ios-vital-num" data-vital="sysDia" value="' + escAttr(v.sysDia) + '" placeholder="120/80" /></div>',
          '    <div class="ios-vital-box"><div class="ios-vital-label"><span>ชีพจร · อุณหภูมิ</span><span>O2 ' + esc(v.spo2 || '-') + '</span></div><div style="display:flex;gap:4px;"><input class="ios-vital-num" style="width:52px;" data-vital="pulse" value="' + escAttr(v.pulse) + '" placeholder="78" />·<input class="ios-vital-num" style="width:58px;font-size:17px;" data-vital="temp" value="' + escAttr(v.temp) + '" placeholder="36.5" /></div></div>',
          '    <div class="ios-vital-box"><span class="ios-vital-label">น้ำหนัก / ส่วนสูง</span><div style="display:flex;gap:4px;"><input class="ios-vital-num" style="width:56px;" data-vital="weight" value="' + escAttr(v.weight) + '" placeholder="60" />/<input class="ios-vital-num" style="width:58px;font-size:17px;" data-vital="height" value="' + escAttr(v.height) + '" placeholder="165" /></div></div>',
          '    <div class="ios-vital-box"><div class="ios-vital-label"><span>BMI · เอว (ซม.)</span><strong style="color:#007AFF;">' + bmiLbl + '</strong></div><div style="display:flex;justify-content:space-between;align-items:baseline;"><strong style="font-size:20px;">' + esc(v.bmi || '—') + '</strong><input class="ios-vital-num" style="width:54px;font-size:16px;text-align:right;" data-vital="waist" value="' + escAttr(v.waist) + '" placeholder="80" /></div></div>',
          '  </div>',
          '  <button type="button" class="ios-disclosure-row" data-modal="sheet_ncd"><div style="display:flex;align-items:center;gap:8px;"><span class="ios-dot ' + ((AppState.smokeStatus && AppState.alcoholStatus) ? 'green' : 'orange') + '"></span><strong style="font-size:14.5px;">น้ำตาล (DTX), บุหรี่ &amp; สุรา (SpecialPP)</strong></div><span style="font-size:13px;color:#64748b;">' + esc([v.sugar ? ('DTX ' + v.sugar) : '', AppState.smokeStatus ? ('บุหรี่: ' + AppState.smokeStatus) : '', AppState.alcoholStatus ? ('สุรา: ' + AppState.alcoholStatus) : ''].filter(Boolean).join(' · ') || 'แตะเพื่อระบุ') + ' ›</span></button>',
          '</div></section>'
        ].join(''),

        '<section><div class="ios-section-head"><h2 class="ios-section-title">การวินิจฉัยโรค (ICD-10)</h2><span style="font-size:12px;color:#64748b;">' + AppState.icd10List.length + ' รายการ</span></div><div class="ios-card">',
        AppState.icd10List.length === 0 ? '<div class="ios-row" style="color:#94a3b8;font-size:14px;">ยังไม่ได้ระบุรหัสการวินิจฉัยโรค</div>' : AppState.icd10List.map((d, i) =>
          '<div class="ios-row" style="justify-content:space-between;flex-wrap:wrap;"><div><span class="ios-code-badge">' + esc(d.diagcode) + '</span> ' + esc(d.diseasename) + '</div><div style="display:flex;gap:6px;align-items:center;"><select data-icd-dx="' + i + '" style="padding:4px;border-radius:7px;border:1px solid #cbd5e1;font-size:12px;"><option value="01" ' + (d.dxtype==='01'?'selected':'') + '>01 หลัก</option><option value="02" ' + (d.dxtype==='02'?'selected':'') + '>02 ร่วม</option><option value="04" ' + (d.dxtype==='04'?'selected':'') + '>04 แทรก</option><option value="05" ' + (d.dxtype==='05'?'selected':'') + '>05 อื่นๆ</option></select><label style="font-size:12px;"><input type="checkbox" data-icd-conti="' + i + '" ' + (d.conti==='1'?'checked':'') + ' /> ต่อเนื่อง</label><input type="date" data-icd-date="' + i + '" value="' + escAttr(d.appointDate) + '" style="padding:3px;border-radius:7px;border:1px solid #cbd5e1;font-size:12px;" /><button type="button" class="ios-del-btn" data-icd-del="' + i + '"><i class="fa-solid fa-xmark"></i></button></div></div>'
        ).join(''),
        '  <button type="button" class="ios-add-row" data-modal="sheet_icd"><span class="ios-plus-dot">+</span><span>เพิ่มรหัสโรค ICD-10</span></button>',
        '</div></section>',

        '<section><div class="ios-section-head"><h2 class="ios-section-title">ยา เวชภัณฑ์ สมุนไพร และหัตถการ</h2><button type="button" class="ios-link-btn" data-modal="sheet_drug">+ เพิ่มรายการ</button></div><div class="ios-card">',
        AppState.drugList.length === 0 ? '<div class="ios-row" style="color:#94a3b8;font-size:14px;">ยังไม่มีรายการยาหรือหัตถการ</div>' : AppState.drugList.map((d, i) =>
          '<div class="ios-row" style="justify-content:space-between;flex-wrap:wrap;"><div style="flex:1;min-width:180px;"><strong style="font-size:14.5px;">' + esc(d.drugname) + '</strong><div style="font-size:11px;color:#94a3b8;">' + esc(d.drugcode) + '</div><button type="button" class="ios-link-btn" style="padding:0;font-size:12.5px;" data-dose-idx="' + i + '">' + esc(d.dose || '+ แตะเพื่อระบุวิธีใช้ยา') + '</button></div><div style="display:flex;align-items:center;gap:10px;"><div class="ios-stepper"><button type="button" class="ios-step-btn" data-step-dec="' + i + '">−</button><input type="number" class="ios-step-val" data-step-val="' + i + '" value="' + d.unit + '" /><button type="button" class="ios-step-btn" data-step-inc="' + i + '">+</button></div><div style="min-width:60px;text-align:right;"><strong>' + (d.unit * d.realprice).toFixed(2) + '</strong></div><button type="button" class="ios-del-btn" data-drug-del="' + i + '"><i class="fa-solid fa-xmark"></i></button></div></div>'
        ).join(''),
        '  <button type="button" class="ios-add-row" data-modal="sheet_drug"><span class="ios-plus-dot">+</span><span>สั่งจ่ายยา / สมุนไพร / หัตถการ / ทันตฯ</span></button>',
        '  <div class="ios-card-footer"><div style="font-size:13px;color:#64748b;">ทุนรวม <strong>' + totalCost.toFixed(2) + ' ฿</strong> · ผู้บันทึก <strong>' + esc((AppState.user && AppState.user.name) || '') + '</strong></div><div style="text-align:right;"><div style="font-size:11px;color:#64748b;">รวมสุทธิ</div><strong style="font-size:20px;">' + totalSell.toFixed(2) + ' ฿</strong></div></div>',
        '</div></section>'
      ].join('') : AppState.staffTab === 'history' ? [
        '<section><div class="ios-section-head"><h2 class="ios-section-title">ประวัติการรับบริการย้อนหลัง 10 ครั้ง (JHCIS)</h2><button type="button" class="ios-link-btn" data-act="re-med">ดึงยาครั้งล่าสุด (Re Med)</button></div><div class="ios-card">',
        AppState.patientHistory.length === 0 ? '<div class="ios-row" style="color:#94a3b8;">ไม่พบประวัติการรับบริการก่อนหน้า</div>' : AppState.patientHistory.map((h) =>
          '<div class="ios-row" style="flex-direction:column;align-items:flex-start;gap:3px;"><strong>' + esc(String(h.visitdate || '').slice(0, 10)) + ' · SEQ ' + h.visitno + '</strong><div style="font-size:13.5px;">' + esc(h.symptoms || '-') + (h.pressure ? (' · BP ' + esc(h.pressure)) : '') + '</div>' +
          (h.diags && h.diags.length ? '<div style="font-size:12.5px;color:#007AFF;">ICD-10: ' + esc(h.diags.map((x) => x.diagcode + ' ' + x.diseasename).join(', ')) + '</div>' : '') +
          (h.drugs && h.drugs.length ? '<div style="font-size:12.5px;color:#64748b;">ยา/บริการ: ' + esc(h.drugs.map((x) => x.drugname + '(' + x.unit + ')').join(', ')) + '</div>' : '') + '</div>'
        ).join(''),
        '</div></section>'
      ].join('') : [
        '<section><div class="ios-section-head"><h2 class="ios-section-title">โรคประจำตัว &amp; ผลวิเคราะห์ AI</h2></div><div class="ios-card">',
        '  <div class="ios-row" style="justify-content:space-between;"><span>โรคประจำตัว</span><strong style="color:' + ((!p.chronic || p.chronic === 'ไม่มีโรคประจำตัว') ? '#1E8E3E' : '#D70015') + ';">' + esc(p.chronic || 'ไม่มีโรคประจำตัว') + '</strong></div>',
        '  <div class="ios-row"><div><strong style="color:#007AFF;">AI พยาบาลประเมินผล</strong><div style="font-size:14px;margin-top:4px;">' + esc(AppState.aiResponse || 'กรอกความดัน/น้ำหนัก/น้ำตาลเพื่อให้ AI วิเคราะห์') + '</div></div></div>',
        ha.alerts.map((a) => '<div class="ios-row" style="background:' + a.color + '14;"><i class="fa-solid ' + a.icon + '" style="color:' + a.color + ';"></i><div><strong style="color:' + a.color + ';">' + esc(a.title) + '</strong><div style="font-size:13px;">' + esc(a.desc) + '</div></div></div>').join(''),
        '</div></section>',
        '<section><div class="ios-section-head"><h2 class="ios-section-title">SpecialPP (บุหรี่ / สุรา / DTX)</h2><button type="button" class="ios-link-btn" data-modal="sheet_ncd">แก้ไข</button></div><div class="ios-card"><div class="ios-row" style="justify-content:space-between;"><span>บุหรี่</span><span>' + esc(AppState.smokeStatus || 'ยังไม่ระบุ') + '</span></div><div class="ios-row" style="justify-content:space-between;"><span>สุรา</span><span>' + esc(AppState.alcoholStatus || 'ยังไม่ระบุ') + '</span></div><div class="ios-row" style="justify-content:space-between;"><span>น้ำตาล DTX</span><span>' + esc(v.sugar ? (v.sugar + ' mg/dL ' + AppState.sugarFasting) : 'ยังไม่ระบุ') + '</span></div></div></section>'
      ].join(''),
      '      </div>'
    ].join(''),
    '    </main>',
    '  </div>',
    '</div>'
  ].join('');
}

function renderAdminDashboard() {
  const t = AppState.tenant || {};
  const an = AppState.analytics;
  let tabBody = '';

  if (AppState.adminTab === 'settings') {
    tabBody = [
      '<h3 style="margin:0 0 16px;color:#007AFF;">⚙️ ตั้งค่าระบบ Kiosk &amp; สื่อหน้าแรก</h3>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">',
      '  <div style="padding:14px;background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;"><label style="font-weight:700;display:block;margin-bottom:8px;">เปลี่ยนรูปโลโก้หน่วยงาน</label><img src="' + escAttr(AppState.customLogo) + '" style="height:70px;object-fit:contain;display:block;margin-bottom:8px;" /><input type="file" id="admLogoFile" accept="image/*" /></div>',
      '  <div style="padding:14px;background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;"><label style="font-weight:700;display:block;margin-bottom:8px;">เปลี่ยนวิดีโอพื้นหลังหน้าแรก (MP4 ≤ 5MB)</label><video src="' + escAttr(AppState.customVideo) + '" muted autoplay loop playsinline style="width:100%;height:70px;object-fit:cover;border-radius:8px;margin-bottom:8px;"></video><input type="file" id="admVideoFile" accept="video/mp4" /></div>',
      '</div>',
      '<div class="tl-field"><label>ชื่อหน่วยงาน / โรงพยาบาล</label><input id="admHospName" value="' + escAttr(getHospDisplay()) + '" /></div>',
      '<div class="tl-field"><label>เปลี่ยนรหัสผ่านเข้าหน้า Admin (กดโลโก้ 5 ครั้ง · เว้นว่างหากไม่เปลี่ยน)</label><input type="password" id="admNewPass" placeholder="ค่าเริ่มต้น: Admin00000" /></div>',
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">',
      '  <button type="button" class="ios-save-btn" style="background:#10b981;" data-act="adm-save-settings">💾 บันทึกการตั้งค่า</button>',
      '  <button type="button" class="ios-save-btn" style="background:#64748b;" data-act="adm-reset-media">คืนค่าโลโก้/วิดีโอเดิม</button>',
      '  <button type="button" class="ios-save-btn" style="background:#ef4444;margin-left:auto;" data-act="switch-tenant">ออกจากสถานบริการ (สลับ Tenant)</button>',
      '</div>',
      '<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:12px;font-size:13px;color:#475569;"><strong>License:</strong> ' + esc(t.hospcode) + ' · หมดอายุ ' + esc(t.expires_at || '-') + ' · Connector: <code>' + esc(t.api_url || '-') + '</code></div>'
    ].join('');
  } else if (AppState.adminTab === 'users') {
    tabBody = [
      '<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap;">',
      '  <div style="flex:1;min-width:200px;"><label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">รหัส PIN Admin หน่วยงาน (Cloud D1)</label><input type="password" id="admCloudPin" value="' + escAttr(AppState.adminPin) + '" placeholder="กรอก PIN Admin" style="width:100%;padding:9px;border-radius:10px;border:1px solid #cbd5e1;" /></div>',
      '  <button type="button" class="ios-save-btn" data-act="adm-load-cloud">โหลดบุคลากร &amp; คลังข้อความ</button>',
      '</div>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">',
      '  <div style="padding:14px;background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;">',
      '    <strong>เพิ่ม/แก้ไขบุคลากรรายบุคคล</strong>',
      '    <input id="nuCid" maxlength="13" placeholder="เลขบัตร 13 หลัก" style="width:100%;padding:8px;margin:8px 0 6px;border-radius:8px;border:1px solid #cbd5e1;" />',
      '    <input id="nuName" placeholder="ชื่อ-สกุล" style="width:100%;padding:8px;margin-bottom:6px;border-radius:8px;border:1px solid #cbd5e1;" />',
      '    <div style="display:flex;gap:10px;font-size:13px;margin-bottom:8px;"><label><input type="checkbox" id="nuStaff" checked /> เจ้าหน้าที่</label><label><input type="checkbox" id="nuVhv" /> อสม.</label><label><input type="checkbox" id="nuAdmin" /> Admin</label></div>',
      '    <button type="button" class="ios-save-btn" style="background:#10b981;" data-act="adm-add-user">บันทึกบุคลากร</button>',
      '  </div>',
      '  <div style="padding:14px;background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;">',
      '    <strong>นำเข้าบุคลากรจาก CSV/Excel (.csv)</strong>',
      '    <p style="font-size:12.5px;color:#64748b;margin:6px 0;">คอลัมน์: cid, full_name, role (staff/vhv/tenant_admin)</p>',
      '    <input type="file" id="admCsvFile" accept=".csv,.txt" style="margin-bottom:8px;" />',
      '    <button type="button" class="ios-save-btn" data-act="adm-upload-csv">นำเข้าบุคลากรขึ้นระบบกลาง</button>',
      '  </div>',
      '</div>',
      '<table class="adm-table"><thead><tr><th>เลขบัตร</th><th>ชื่อ-สกุล</th><th>บทบาท</th><th>ลบ</th></tr></thead><tbody>',
      AppState.tenantUsers.length ? AppState.tenantUsers.map((u) => '<tr><td>' + esc(u.cid) + '</td><td><strong>' + esc(u.full_name || u.name) + '</strong></td><td>' + esc(u.role) + '</td><td><button type="button" class="ios-del-btn" data-del-user="' + escAttr(u.cid) + '">✕</button></td></tr>').join('') : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">กรอก PIN แล้วกดโหลดข้อมูล</td></tr>',
      '</tbody></table>'
    ].join('');
  } else if (AppState.adminTab === 'data') {
    tabBody = [
      '<h3 style="margin:0 0 12px;color:#f59e0b;">💾 คิวค้างส่งออฟไลน์ (' + AppState.offlineQueue.length + ' รายการ)</h3>',
      AppState.offlineQueue.length ? AppState.offlineQueue.map((q) => '<div style="padding:12px;border-left:4px solid #f59e0b;background:#f8fafc;border-radius:8px;margin-bottom:8px;"><strong>' + esc(q.name || '-') + '</strong> (CID: ' + esc(q.cid) + ') · BP: ' + esc(q.sysDia || '-') + ' · ' + esc(q.timestamp || '') + '</div>').join('') : '<p style="text-align:center;color:#94a3b8;padding:24px;">ไม่มีข้อมูลค้างส่ง</p>',
      '<div style="display:flex;gap:10px;margin-top:14px;"><button type="button" class="ios-save-btn" style="background:#ef4444;" data-act="adm-clear-offline">ลบทิ้งทั้งหมด</button><button type="button" class="ios-save-btn" data-act="adm-sync-offline">🔄 ซิงค์ขึ้น JHCIS ทันที</button></div>'
    ].join('');
  } else if (AppState.adminTab === 'vhv') {
    tabBody = [
      '<h3 style="margin:0 0 12px;color:#10b981;">🧑‍⚕️ ผลงาน อสม. (รีเฟรชอัตโนมัติทุก 3 วินาที)</h3>',
      '<div style="overflow-x:auto;"><table class="adm-table"><thead><tr><th>ชื่อ-สกุล อสม.</th><th>ตรวจสอบ</th><th>ผู้ป่วย</th><th>นน.</th><th>สส.</th><th>ความดัน</th><th>ชีพจร</th><th>อุณหภูมิ</th><th>เอว</th><th>น้ำตาล</th></tr></thead><tbody>',
      AppState.vhvStats.length ? AppState.vhvStats.map((v) => '<tr><td><strong>' + esc(v.vhv_name) + '</strong> ' + (Number(v.is_online)===1 ? '<span style="font-size:11px;background:#d1fae5;color:#059669;padding:2px 8px;border-radius:999px;">Online</span>' : '') + '</td><td><button type="button" class="ios-save-btn" style="padding:5px 12px;font-size:12px;" data-vhv-cid="' + escAttr(v.vhv_cid) + '" data-vhv-name="' + escAttr(v.vhv_name) + '">🔍 ตรวจสอบ</button></td><td><strong style="color:#007AFF;">' + v.total_patients + '</strong></td><td>' + v.weight_recorded + '/' + v.total_patients + '</td><td>' + v.height_recorded + '/' + v.total_patients + '</td><td>' + v.bp_recorded + '/' + v.total_patients + '</td><td>' + v.pulse_recorded + '/' + v.total_patients + '</td><td>' + v.temp_recorded + '/' + v.total_patients + '</td><td>' + v.waist_recorded + '/' + v.total_patients + '</td><td style="color:#6366f1;font-weight:700;">' + v.sugar_recorded + '</td></tr>').join('') : '<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:24px;">ยังไม่มีข้อมูลการปฏิบัติงาน</td></tr>',
      '</tbody></table></div>'
    ].join('');
  } else if (AppState.adminTab === 'analytics') {
    const g = (an && an.ageGroups) || { gen1: 0, gen2: 0, gen3: 0, gen4: 0 };
    const mx = Math.max(1, g.gen1, g.gen2, g.gen3, g.gen4);
    const sat = (an && an.satisfaction && an.satisfaction.chartData) || [];
    const votes = sat.reduce((s, d) => s + (Number(d.value) || 0), 0);
    let deg = 0;
    const stops = sat.filter((d) => Number(d.value) > 0).map((d) => { const st = deg; deg += (Number(d.value) / votes) * 360; return (d.color || '#3b82f6') + ' ' + st.toFixed(1) + 'deg ' + deg.toFixed(1) + 'deg'; });
    tabBody = !an ? '<p style="text-align:center;padding:30px;color:#8b5cf6;">กำลังโหลดสถิติงานวิจัย...</p>' : [
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px;">',
      '  <div style="background:#eff6ff;padding:16px;border-radius:14px;text-align:center;"><div style="font-size:13px;color:#2563eb;font-weight:700;">ผู้ใช้งานทั้งหมด</div><div style="font-size:32px;font-weight:800;color:#1d4ed8;">' + ((an.usage && an.usage.total) || 0) + '</div></div>',
      '  <div style="background:#ecfdf5;padding:16px;border-radius:14px;text-align:center;"><div style="font-size:13px;color:#059669;font-weight:700;">เพศชาย</div><div style="font-size:32px;font-weight:800;color:#047857;">' + ((an.usage && an.usage.male) || 0) + '</div></div>',
      '  <div style="background:#fdf2f8;padding:16px;border-radius:14px;text-align:center;"><div style="font-size:13px;color:#db2777;font-weight:700;">เพศหญิง</div><div style="font-size:32px;font-weight:800;color:#be185d;">' + ((an.usage && an.usage.female) || 0) + '</div></div>',
      '</div>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">',
      '  <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;"><strong style="display:block;text-align:center;">กราฟสัดส่วนช่วงอายุ</strong><div class="bar-chart">' +
      [['0-15 ปี',g.gen1,'#f59e0b'],['16-35 ปี',g.gen2,'#3b82f6'],['36-60 ปี',g.gen3,'#ec4899'],['60+ ปี',g.gen4,'#10b981']].map((b) => '<div class="bar-col"><strong>' + b[1] + '</strong><div class="bar-fill" style="height:' + Math.max(4, Math.round(b[1]/mx*100)) + '%;background:' + b[2] + ';"></div><small>' + b[0] + '</small></div>').join('') + '</div></div>',
      '  <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;"><div><strong style="display:block;text-align:center;">ความพึงพอใจเฉลี่ย ' + ((an.satisfaction && an.satisfaction.average) || 0) + ' / 5 ดาว</strong><div style="width:130px;height:130px;border-radius:50%;margin:10px auto;display:flex;align-items:center;justify-content:center;background:' + (stops.length ? ('conic-gradient(' + stops.join(',') + ')') : '#e2e8f0') + ';"><div style="width:82px;height:82px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;">' + votes + ' โหวต</div></div><p style="font-size:13.5px;color:#334155;line-height:1.6;">' + esc(an.summary || '') + '</p></div><button type="button" class="ios-save-btn" style="width:100%;" data-act="adm-copy-word">📋 คัดลอกสรุปผลไปใส่ Word</button></div>',
      '</div>'
    ].join('');
  } else if (AppState.adminTab === 'bp') {
    tabBody = [
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;"><h3 style="margin:0;color:#dc2626;">🩸 เฝ้าระวังความดันโลหิตสูง (&gt;=140/90)</h3><input type="date" id="admBpDate" value="' + escAttr(AppState.bpDate) + '" style="padding:8px 12px;border-radius:10px;border:1px solid #cbd5e1;" /></div>',
      AppState.bpData.length ? AppState.bpData.map((it, idx) =>
        '<div data-bp-idx="' + idx + '" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-radius:14px;border:1.5px solid ' + (it.follow_up_note ? '#10b981' : '#e2e8f0') + ';margin-bottom:10px;cursor:pointer;"><div><strong style="font-size:17px;">' + esc(it.patient_name) + '</strong> ' +
        (it.follow_up_note ? '<span style="background:#d1fae5;color:#059669;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;">ติดตามแล้ว</span> ' : '') +
        (it.follow_up_note && it.follow_up_note.startsWith('[REFER]') ? '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;">Refer</span>' : '') +
        (it.follow_up_note && it.follow_up_note.startsWith('[NOREFER]') ? '<span style="background:#e0f2fe;color:#0284c7;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;">No Refer</span>' : '') +
        '<div style="font-size:13px;color:#64748b;margin-top:4px;">เวลา ' + esc(it.record_time) + ' น. · อสม.: ' + esc(it.vhv_name) + '</div></div><div style="text-align:center;padding:8px 16px;border-radius:12px;background:' + (it.colorHex || '#dc2626') + '18;"><strong style="font-size:24px;color:' + (it.colorHex || '#dc2626') + ';">' + esc(it.sys_dia) + '</strong><div style="font-size:12px;font-weight:700;color:' + (it.colorHex || '#dc2626') + ';">' + esc(it.levelName || '') + '</div></div></div>'
      ).join('') : '<p style="text-align:center;color:#94a3b8;padding:30px;">ไม่มีผู้ป่วยความดันสูงเกินเกณฑ์ในวันที่เลือก</p>'
    ].join('');
  }

  return [
    '<div class="app-container">',
    renderTopHeader(),
    '  <button type="button" class="top-left-back danger" data-act="admin-home"><i class="fa-solid fa-right-from-bracket"></i> กลับหน้าแรก</button>',
    '  <div class="dashboard-scroll"><div class="admin-wrap">',
    '    <div class="admin-tabs">',
    '      <button type="button" class="admin-tab-btn ' + (AppState.adminTab==='settings'?'active':'') + '" data-atab="settings">⚙️ ตั้งค่าระบบ</button>',
    '      <button type="button" class="admin-tab-btn ' + (AppState.adminTab==='users'?'active':'') + '" data-atab="users">👥 บุคลากร</button>',
    '      <button type="button" class="admin-tab-btn ' + (AppState.adminTab==='data'?'active':'') + '" data-atab="data">💾 ค้างส่ง (' + AppState.offlineQueue.length + ')</button>',
    '      <button type="button" class="admin-tab-btn ' + (AppState.adminTab==='vhv'?'active':'') + '" data-atab="vhv">🧑‍⚕️ ผลงาน อสม.</button>',
    '      <button type="button" class="admin-tab-btn ' + (AppState.adminTab==='analytics'?'active':'') + '" data-atab="analytics">📈 สถิติวิจัย</button>',
    '      <button type="button" class="admin-tab-btn ' + (AppState.adminTab==='bp'?'active':'') + '" data-atab="bp">🩸 เฝ้าระวังความดัน</button>',
    '    </div>',
    tabBody,
    '  </div></div>',
    '</div>'
  ].join('');
}

function renderActiveModal() {
  const m = AppState.modal;
  if (!m) return '';
  if (m === 'vhv_login') {
    return '<div class="m-backdrop" data-close="1"><div class="m-box"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 8px;">ลงชื่อเข้าปฏิบัติงาน (อสม. / เจ้าหน้าที่)</h3><p style="color:#64748b;margin:0 0 14px;">กรอกเลขบัตรประชาชน 13 หลัก</p><input id="inpVhvCid" type="tel" maxlength="13" class="pin-input" placeholder="เลขบัตร 13 หลัก" /><div id="vhvErr" style="color:#dc2626;font-size:13.5px;font-weight:700;min-height:22px;margin:8px 0;"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button type="button" class="ios-pill" style="justify-content:center;" data-act="close-modal">ยกเลิก</button><button type="button" class="ios-save-btn" style="background:#10b981;" data-act="submit-vhv">ยืนยัน</button></div></div></div>';
  }
  if (m === 'manual_cid') {
    return '<div class="m-backdrop" data-close="1"><div class="m-box"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 8px;">ค้นหาประวัติผู้ป่วย</h3><p style="color:#64748b;margin:0 0 14px;">กรอกเลขประจำตัวประชาชน 13 หลัก</p><input id="inpPatCid" type="tel" maxlength="13" class="pin-input" placeholder="●●●●●●●●●●●●●" /><div id="patErr" style="color:#dc2626;font-size:13.5px;font-weight:700;min-height:22px;margin:8px 0;"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button type="button" class="ios-pill" style="justify-content:center;" data-act="close-modal">ยกเลิก</button><button type="button" class="ios-save-btn" data-act="submit-pat-cid">ค้นหาผู้ป่วย</button></div></div></div>';
  }
  if (m === 'admin_pass') {
    return '<div class="m-backdrop" data-close="1"><div class="m-box"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 8px;">เข้าสู่โหมดผู้ดูแลระบบ (Admin)</h3><p style="color:#64748b;margin:0 0 14px;">ใส่รหัสผ่าน Admin หรือ PIN หน่วยงาน</p><input id="inpAdmPass" type="password" class="pin-input" placeholder="••••••••" /><div id="admPassErr" style="color:#dc2626;font-size:13.5px;font-weight:700;min-height:22px;margin:8px 0;"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button type="button" class="ios-pill" style="justify-content:center;" data-act="close-modal">ยกเลิก</button><button type="button" class="ios-save-btn" data-act="submit-adm-pass">ยืนยัน</button></div></div></div>';
  }
  if (m === 'bt') {
    const devs = [['weight','/scale.jpg','เครื่องชั่งน้ำหนัก (SCALE)'],['temp','/temp.png','เครื่องวัดอุณหภูมิ (Thermometer)'],['bp','/bp.jpg','เครื่องวัดความดัน (BP Monitor)'],['sugar','/sugar.png','เครื่องวัดน้ำตาล (Glucose)'],['o2','/o2.png','เครื่องวัดออกซิเจน (Oximeter)']];
    return '<div class="m-backdrop" data-close="1"><div class="m-box lg" style="text-align:left;"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 14px;color:#1e40af;"><i class="fa-brands fa-bluetooth-b"></i> อุปกรณ์ที่เชื่อมต่อ Mini Health Station</h3>' +
      devs.map((d) => '<div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px;"><img src="' + d[1] + '" style="width:52px;height:52px;object-fit:contain;" /><div style="flex:1;"><strong style="font-size:14px;">' + d[2] + '</strong><div style="font-size:12px;color:' + (AppState.devices[d[0]] ? '#10b981' : '#94a3b8') + ';">' + (AppState.devices[d[0]] ? ('เชื่อมต่อแล้ว: ' + esc(AppState.devices[d[0]])) : 'ยังไม่ได้จับคู่') + '</div></div><label class="switch-ui"><input type="checkbox" data-bt-sw="' + d[0] + '" ' + (AppState.devices[d[0]] ? 'checked' : '') + ' /><span class="switch-tr"><span class="switch-th"></span></span></label></div>').join('') + '</div></div>';
  }
  if (m === 'guide') {
    const g = AppState.modalData;
    return '<div class="m-backdrop" data-close="1"><div class="m-box lg"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 12px;color:#1e40af;">' + esc(g.title) + '</h3><div style="height:260px;background:#f1f5f9;border-radius:14px;overflow:hidden;margin-bottom:14px;"><img src="' + escAttr(g.gif) + '" style="width:100%;height:100%;object-fit:contain;" /></div><p style="font-size:17px;font-weight:700;color:#334155;margin:0 0 18px;">' + esc(g.desc) + '</p><button type="button" class="btn-full" style="background:#2563eb;" data-act="guide-ble"><i class="fa-brands fa-bluetooth-b"></i> พร้อมแล้ว! เริ่มเชื่อมต่ออุปกรณ์</button></div></div>';
  }
  if (m === 'sugar_fasting') {
    return '<div class="m-backdrop" data-close="1"><div class="m-box"><h3 style="margin:0 0 8px;">ประเมินก่อนเจาะน้ำตาล</h3><p style="color:#64748b;margin:0 0 18px;">กรุณาระบุสภาวะของคนไข้ก่อนเจาะเลือด</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button type="button" class="ios-save-btn" data-fasting="งดน้ำ-อาหาร">งดน้ำ - อาหารฯ</button><button type="button" class="ios-save-btn" style="background:#0284c7;" data-fasting="ไม่งดน้ำ-อาหาร">ไม่งดน้ำ - อาหารฯ</button></div></div></div>';
  }
  if (m === 'confirm_save') {
    return '<div class="m-backdrop" data-close="1"><div class="m-box"><h3 style="margin:0 0 10px;">ยืนยันการบันทึกข้อมูล</h3><p style="color:#475569;margin:0 0 20px;">ต้องการบันทึกข้อมูลและส่งเข้าสู่ระบบ <strong>JHCIS</strong> ใช่หรือไม่?</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><button type="button" class="ios-pill" style="justify-content:center;" data-act="close-modal">ยกเลิก</button><button type="button" class="ios-save-btn" style="background:#10b981;" data-act="confirm-save-now">ตกลงบันทึก</button></div></div></div>';
  }
  if (m === 'rating') {
    const opts = [[1,'fa-face-angry','#E53935','แย่มาก'],[2,'fa-face-frown','#FB8C00','ปรับปรุง'],[3,'fa-face-meh','#FBC02D','ปานกลาง'],[4,'fa-face-smile','#7CB342','ดีมาก'],[5,'fa-face-laugh-beam','#43A047','ดีเยี่ยม']];
    return '<div class="m-backdrop"><div class="m-box lg"><h2 style="margin:0 0 6px;color:#10b981;">จัดคิวสำเร็จ!</h2><p style="color:#64748b;margin:0;">การให้บริการในวันนี้เป็นอย่างไรบ้างครับ?</p><div class="rating-row">' +
      opts.map((o) => '<button type="button" class="rating-opt ' + (AppState.ratingScore === o[0] ? 'sel' : '') + '" data-rate="' + o[0] + '"><i class="fa-solid ' + o[1] + '" style="font-size:38px;color:' + o[2] + ';"></i><strong style="font-size:13px;">' + o[3] + '</strong></button>').join('') +
      '</div><button type="button" class="btn-full" style="background:#10b981;" data-act="submit-rating">ส่งคะแนนและเสร็จสิ้น</button></div></div>';
  }
  if (m === 'emergency') {
    return '<div class="m-backdrop" style="background:rgba(220,38,38,0.88);z-index:9999;"><div class="m-box" style="border:4px solid #fca5a5;"><i class="fa-solid fa-triangle-exclamation" style="font-size:66px;color:#dc2626;"></i><h2 style="color:#dc2626;margin:8px 0;">อันตราย! ความดันสูงวิกฤต</h2><p style="font-size:18px;font-weight:700;">ความดันของคุณคือ <span style="color:#dc2626;font-size:26px;">' + esc(AppState.vitals.sysDia) + '</span><br/>กรุณานั่งพักและแจ้งเจ้าหน้าที่ทันที</p><div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;"><a href="tel:1669" class="btn-full" style="background:#dc2626;"><i class="fa-solid fa-phone-volume"></i> โทรสายด่วน 1669</a><button type="button" class="ios-pill" style="justify-content:center;padding:12px;" data-act="close-modal">รับทราบและปิดหน้าต่าง</button></div></div></div>';
  }
  if (m === 'telemed') {
    const rm = 'MiniHealthStation-' + ((AppState.tenant && AppState.tenant.hospcode) || '12345');
    return '<div class="m-backdrop"><div style="width:92vw;height:86vh;background:#0f172a;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;"><div style="padding:14px 20px;display:flex;justify-content:space-between;align-items:center;color:#fff;"><strong>ระบบแพทย์ทางไกล (Telemedicine)</strong><button type="button" class="btn-badge-out" style="padding:8px 18px;" data-act="close-modal">วางสาย / กลับหน้าหลัก</button></div><iframe src="https://meet.jit.si/' + rm + '#config.prejoinPageEnabled=false" allow="camera; microphone; fullscreen; display-capture; autoplay" style="width:100%;flex:1;border:none;"></iframe></div></div>';
  }
  if (m === 'preset') {
    const isCC = AppState.modalData.target === 'symptoms';
    const curVal = isCC ? AppState.customSymptoms : AppState.customSymptomsco;
    const list = isCC ? AppState.ccPresets : AppState.piPresets;
    const q = (AppState.modalData.q || '').toLowerCase();
    return '<div class="m-backdrop" data-close="1"><div class="m-box xl"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 10px;color:#4f46e5;">' + (isCC ? 'คลังข้อความสำเร็จรูป (อาการสำคัญ - CC)' : 'คลังข้อความสำเร็จรูป (อาการร่วม - PI)') + '</h3>' +
      '<textarea id="preCurVal" rows="2" style="width:100%;padding:10px;border-radius:10px;border:1px solid #818cf8;margin-bottom:8px;">' + esc(curVal) + '</textarea>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px;"><input id="preNewIn" placeholder="พิมพ์ข้อความใหม่เพื่อเพิ่มเข้าคลัง..." style="flex:1;padding:9px;border-radius:8px;border:1px solid #a7f3d0;" /><button type="button" class="ios-save-btn" style="background:#10b981;" data-act="add-preset">+ เพิ่มใหม่</button><button type="button" class="ios-save-btn" style="background:#ef4444;" data-act="clear-preset">ล้าง</button></div>' +
      '<input id="preSearchIn" value="' + escAttr(AppState.modalData.q || '') + '" placeholder="ค้นหาข้อความสำเร็จรูป..." style="width:100%;padding:9px;border-radius:8px;border:1px solid #cbd5e1;margin-bottom:10px;" />' +
      '<div style="max-height:38vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">' +
      list.filter((x) => x.toLowerCase().includes(q)).map((x, idx) => '<div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid #e2e8f0;border-radius:10px;"><button type="button" style="flex:1;text-align:left;border:none;background:transparent;cursor:pointer;font-size:14.5px;" data-pick-preset="' + escAttr(x) + '"><i class="fa-solid fa-circle-plus" style="color:#4f46e5;margin-right:6px;"></i>' + esc(x) + '</button><button type="button" class="ios-del-btn" data-del-preset="' + idx + '">✕</button></div>').join('') +
      '</div><div style="text-align:right;margin-top:12px;"><button type="button" class="ios-save-btn" data-act="close-modal">เสร็จสิ้น</button></div></div></div>';
  }
  if (m === 'sheet_icd') {
    return '<div class="m-backdrop" data-close="1"><div class="m-sheet"><div class="m-sheet-head"><button class="ios-link-btn" data-act="close-modal">ปิด</button><strong>เพิ่มรหัสโรค ICD-10</strong><span style="width:30px;"></span></div><div class="m-sheet-body"><input id="shIcdIn" class="ios-search-input" style="background:#fff;padding-left:12px;" value="' + escAttr(AppState.icdSearch) + '" placeholder="พิมพ์รหัสหรือชื่อโรค เช่น J00, I10, E11..." /><div class="ios-pill-row">' + ['J00','J06','I10','E11','M79','K29','Z00'].map((c) => '<button type="button" class="ios-pill blue" data-hot-icd="' + c + '">' + c + '</button>').join('') + '</div><div class="ios-card">' + (AppState.icdResults.length ? AppState.icdResults.map((r, i) => '<button type="button" class="ios-disclosure-row" style="border-top:0.5px solid #e2e8f0;" data-add-icd="' + i + '"><div><span class="ios-code-badge">' + esc(r.diseasecode) + '</span> ' + esc(r.diseasenamethai || r.diseasename) + '</div><strong style="color:#007AFF;">+</strong></button>').join('') : '<div class="ios-row" style="color:#94a3b8;">พิมพ์อย่างน้อย 2 ตัวอักษร หรือแตะรหัสด่วน</div>') + '</div></div></div></div>';
  }
  if (m === 'sheet_drug') {
    return '<div class="m-backdrop" data-close="1"><div class="m-sheet"><div class="m-sheet-head"><button class="ios-link-btn" data-act="close-modal">ปิด</button><strong>สั่งจ่ายยา / สมุนไพร / หัตถการ</strong><span style="width:30px;"></span></div><div class="m-sheet-body"><div class="ios-segmented">' + [['all','ทั้งหมด'],['herb','สมุนไพร'],['service','หัตถการ'],['adp','ADP'],['dental','ทันตฯ']].map((t) => '<button type="button" class="ios-seg-btn ' + (AppState.drugCategory===t[0]?'active':'') + '" data-dcat="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><input id="shDrugIn" class="ios-search-input" style="background:#fff;padding-left:12px;" value="' + escAttr(AppState.drugSearch) + '" placeholder="พิมพ์ชื่อยา สมุนไพร หัตถการ..." /><div class="ios-card">' + (AppState.drugResults.length ? AppState.drugResults.map((d, i) => '<button type="button" class="ios-disclosure-row" style="border-top:0.5px solid #e2e8f0;" data-add-drug="' + i + '"><div><strong>' + esc(d.drugname) + '</strong><div style="font-size:11px;color:#64748b;">' + esc(d.drugcode) + '</div></div><strong style="color:#007AFF;">' + Number(d.realprice || 0).toFixed(2) + ' ฿</strong></button>').join('') : '<div class="ios-row" style="color:#94a3b8;">พิมพ์เพื่อค้นหาจากตาราง cdrug</div>') + '</div></div></div></div>';
  }
  if (m === 'sheet_ncd') {
    return '<div class="m-backdrop" data-close="1"><div class="m-sheet"><div class="m-sheet-head"><button class="ios-link-btn" data-act="close-modal">ปิด</button><strong>DTX &amp; บุหรี่ / สุรา (SpecialPP)</strong><button class="ios-link-btn" style="font-weight:700;" data-act="close-modal">เสร็จสิ้น</button></div><div class="m-sheet-body"><div class="ios-card"><div class="ios-row" style="justify-content:space-between;"><span>ค่าน้ำตาล DTX</span><input data-vital="sugar" value="' + escAttr(AppState.vitals.sugar) + '" placeholder="ไม่ระบุ" style="width:100px;text-align:right;border:none;color:#007AFF;font-weight:700;" /></div><div class="ios-row" style="justify-content:space-between;"><span>สภาวะก่อนเจาะ</span><select data-bind="sugarFasting" style="border:none;color:#007AFF;"><option value="">-- ไม่ระบุ --</option><option value="งดน้ำ-อาหาร" ' + (AppState.sugarFasting==='งดน้ำ-อาหาร'?'selected':'') + '>งดน้ำ-อาหาร</option><option value="ไม่งดน้ำ-อาหาร" ' + (AppState.sugarFasting==='ไม่งดน้ำ-อาหาร'?'selected':'') + '>ไม่งดน้ำ-อาหาร</option></select></div></div><div class="ios-card"><div class="ios-row" style="justify-content:space-between;"><span>สูบบุหรี่ *</span><select data-bind="smokeStatus" style="border:none;color:#007AFF;"><option value="">-- เลือก --</option><option value="ไม่สูบ" ' + (AppState.smokeStatus==='ไม่สูบ'?'selected':'') + '>ไม่สูบ</option><option value="เคยสูบแต่เลิกแล้ว" ' + (AppState.smokeStatus==='เคยสูบแต่เลิกแล้ว'?'selected':'') + '>เคยสูบแต่เลิกแล้ว</option><option value="ยังสูบอยู่" ' + (AppState.smokeStatus==='ยังสูบอยู่'?'selected':'') + '>ยังสูบอยู่</option></select></div>' + (AppState.smokeStatus==='ยังสูบอยู่' ? '<div class="ios-row" style="justify-content:space-between;"><span>ปริมาณ</span><select data-bind="smokeAmount" style="border:none;color:#007AFF;"><option value="1B509">ไม่ระบุ</option><option value="1B501" ' + (AppState.smokeAmount==='1B501'?'selected':'') + '>1-10 มวน/วัน</option><option value="1B502" ' + (AppState.smokeAmount==='1B502'?'selected':'') + '>11-19 มวน/วัน</option><option value="1B503" ' + (AppState.smokeAmount==='1B503'?'selected':'') + '>20+ มวน/วัน</option></select></div><div class="ios-row" style="justify-content:space-between;"><span>หลังตื่นนอน</span><select data-bind="smokeWake" style="border:none;color:#007AFF;"><option value="">ไม่ระบุ</option><option value="1B504" ' + (AppState.smokeWake==='1B504'?'selected':'') + '>น้อยกว่า 30 นาที</option><option value="1B505" ' + (AppState.smokeWake==='1B505'?'selected':'') + '>30 นาที-1 ชม.</option><option value="1B506" ' + (AppState.smokeWake==='1B506'?'selected':'') + '>1 ชม. ขึ้นไป</option></select></div><div class="ios-row" style="justify-content:space-between;"><span>คำแนะนำ</span><select data-bind="smokeAdvice" style="border:none;color:#007AFF;"><option value="">ไม่ระบุ</option><option value="1B530" ' + (AppState.smokeAdvice==='1B530'?'selected':'') + '>1B530 สั้นๆ</option></select></div>' : '') + '</div><div class="ios-card"><div class="ios-row" style="justify-content:space-between;"><span>ดื่มสุรา *</span><select data-bind="alcoholStatus" style="border:none;color:#007AFF;"><option value="">-- เลือก --</option><option value="ไม่ดื่ม" ' + (AppState.alcoholStatus==='ไม่ดื่ม'?'selected':'') + '>ไม่ดื่ม</option><option value="เคยดื่มแต่เลิกแล้ว" ' + (AppState.alcoholStatus==='เคยดื่มแต่เลิกแล้ว'?'selected':'') + '>เคยดื่มแต่เลิกแล้ว</option><option value="ยังดื่มอยู่" ' + (AppState.alcoholStatus==='ยังดื่มอยู่'?'selected':'') + '>ยังดื่มอยู่</option></select></div>' + (AppState.alcoholStatus==='ยังดื่มอยู่' ? '<div class="ios-row" style="justify-content:space-between;"><span>คำแนะนำ</span><select data-bind="alcoholAdvice" style="border:none;color:#007AFF;"><option value="">ไม่ระบุ</option><option value="1B611" ' + (AppState.alcoholAdvice==='1B611'?'selected':'') + '>1B611 สั้นๆ</option></select></div>' : '') + '</div></div></div></div>';
  }
  if (m === 'sheet_allergy') {
    return '<div class="m-backdrop" data-close="1"><div class="m-sheet"><div class="m-sheet-head"><button class="ios-link-btn" data-act="close-modal">ปิด</button><strong>ประวัติแพ้ยา &amp; แพ้อาหาร</strong><span style="width:30px;"></span></div><div class="m-sheet-body"><div class="ios-card">' + (AppState.drugAllergies.length ? AppState.drugAllergies.map((a) => '<div class="ios-row" style="color:#D70015;font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(a.drugname) + ' (' + esc(a.drugcode) + ')</div>').join('') : '<div class="ios-row" style="color:#1E8E3E;">ไม่พบประวัติแพ้ยาใน JHCIS</div>') + '</div><div class="ios-card"><div class="ios-row"><label class="ios-row-label" style="width:90px;">แพ้อาหาร</label><input class="ios-field-input" data-bind="foodAllergy" value="' + escAttr(AppState.foodAllergy) + '" placeholder="ระบุอาหารที่แพ้ (ถ้ามี)" /></div></div></div></div></div>';
  }
  if (m === 'sheet_dose') {
    const idx = AppState.modalData.idx;
    const drug = AppState.drugList[idx] || {};
    return '<div class="m-backdrop" data-close="1"><div class="m-sheet"><div class="m-sheet-head"><button class="ios-link-btn" data-act="close-modal">ปิด</button><strong>วิธีใช้ยา</strong><button class="ios-link-btn" style="font-weight:700;" data-act="save-dose">เสร็จสิ้น</button></div><div class="m-sheet-body"><div class="ios-card" style="padding:14px;"><strong style="display:block;margin-bottom:8px;">' + esc(drug.drugname) + '</strong><textarea id="shDoseTxt" rows="3" style="width:100%;padding:10px;border-radius:10px;border:1px solid #cbd5e1;margin-bottom:10px;">' + esc(drug.dose || '') + '</textarea><div style="display:flex;flex-wrap:wrap;gap:6px;">' + DOSE_PRESETS.map((dp) => '<button type="button" class="ios-pill" style="font-size:12px;" data-pick-dose="' + escAttr(dp) + '">' + esc(dp) + '</button>').join('') + '</div></div></div></div></div>';
  }
  if (m === 'vhv_logs') {
    return '<div class="m-backdrop" data-close="1"><div class="m-box xl"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 12px;">ผู้ป่วยที่บันทึกโดย: <span style="color:#10b981;">' + esc(AppState.selectedVhvName) + '</span></h3><div style="max-height:60vh;overflow:auto;"><table class="adm-table"><thead><tr><th>เวลา</th><th>ชื่อผู้ป่วย</th><th>นน.</th><th>สส.</th><th>ความดัน</th><th>ชีพจร</th><th>อุณหภูมิ</th><th>เอว</th><th>น้ำตาล</th></tr></thead><tbody>' + (AppState.vhvLogs.length ? AppState.vhvLogs.map((l) => '<tr><td>' + esc(l.record_time) + '</td><td><strong>' + esc(l.patient_name || l.patient_cid) + '</strong></td><td>' + (l.weight > 0 ? l.weight : '-') + '</td><td>' + (l.height > 0 ? l.height : '-') + '</td><td><strong>' + esc(l.sys_dia || '-') + '</strong></td><td>' + (l.pulse > 0 ? l.pulse : '-') + '</td><td>' + (l.temp > 0 ? Number(l.temp).toFixed(1) : '-') + '</td><td>' + (l.waist > 0 ? l.waist : '-') + '</td><td>' + (l.sugar > 0 ? l.sugar : '-') + '</td></tr>').join('') : '<tr><td colspan="9" style="text-align:center;color:#94a3b8;">ไม่มีข้อมูล</td></tr>') + '</tbody></table></div></div></div>';
  }
  if (m === 'bp_follow' && AppState.selectedBp) {
    const b = AppState.selectedBp;
    return '<div class="m-backdrop" data-close="1"><div class="m-box lg" style="text-align:left;"><button class="m-close" data-act="close-modal">✕</button><h3 style="margin:0 0 10px;color:#dc2626;">ติดตามอาการความดันสูง</h3><div style="padding:12px;background:#f8fafc;border-radius:10px;margin-bottom:12px;"><strong>คุณ' + esc(b.patient_name) + '</strong> · ความดัน <strong>' + esc(b.sys_dia) + '</strong> (' + esc(b.levelName || '') + ')</div><textarea id="bpFollowIn" rows="3" style="width:100%;padding:10px;border-radius:10px;border:1px solid #cbd5e1;margin-bottom:10px;">' + esc(AppState.followNote) + '</textarea><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;"><button type="button" class="ios-pill" style="justify-content:center;' + (AppState.referStatus==='refer'?'border:2px solid #ef4444;background:#fee2e2;color:#dc2626;':'') + '" data-ref="refer">ส่งต่อ (Refer)</button><button type="button" class="ios-pill" style="justify-content:center;' + (AppState.referStatus==='norefer'?'border:2px solid #10b981;background:#d1fae5;color:#059669;':'') + '" data-ref="norefer">ไม่ส่งต่อ (No Refer)</button></div><button type="button" class="btn-full" style="background:#10b981;" data-act="save-bp-follow">บันทึกการติดตาม</button></div></div>';
  }
  return '';
}

function render() {
  let html = '';
  if (AppState.view === 'tenant_login') html = renderTenantLogin();
  else if (AppState.view === 'home') html = renderHomeScreen();
  else if (AppState.view === 'kiosk') html = renderVhvKiosk();
  else if (AppState.view === 'staff') html = renderStaffWorkspace();
  else if (AppState.view === 'admin') html = renderAdminDashboard();
  rootEl.innerHTML = html + renderActiveModal() + (isSaving ? '<div class="m-backdrop" style="z-index:99999;color:#fff;flex-direction:column;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:46px;margin-bottom:12px;"></i><h3>กำลังบันทึกข้อมูลเข้า JHCIS...</h3></div>' : '');

  const sc = document.getElementById('staffScroll');
  if (sc) {
    sc.onscroll = () => {
      const ct = document.getElementById('compactTitle');
      if (ct) ct.style.opacity = sc.scrollTop > 50 ? '1' : '0';
    };
  }
  const f1 = document.getElementById('inpVhvCid') || document.getElementById('inpPatCid') || document.getElementById('inpAdmPass') || document.getElementById('shIcdIn') || document.getElementById('shDrugIn');
  if (f1) { f1.focus(); if (f1.setSelectionRange && f1.value) try { f1.setSelectionRange(f1.value.length, f1.value.length); } catch (e) {} }
}

// ==================== GLOBAL EVENTS ====================
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'frmTenantLogin') {
    e.preventDefault();
    const hospcode = document.getElementById('tlHosp').value.trim();
    const license_key = document.getElementById('tlKey').value.trim();
    const cloudUrl = (document.getElementById('tlCloudUrl') && document.getElementById('tlCloudUrl').value) || DEFAULT_CLOUD_URL;
    const errEl = document.getElementById('tlErr');
    errEl.textContent = 'กำลังตรวจสอบสิทธิ์...';
    AppState.cloudUrl = cloudUrl; localStorage.setItem('mhs_cloud_url', cloudUrl);
    try {
      const r = await cloudFetch('/api/license/verify', { method: 'POST', body: JSON.stringify({ hospcode, license_key, client_type: 'pwa' }) });
      if (!r.ok || !r.data.valid || !r.data.tenant) { errEl.textContent = (r.data && r.data.message) || 'License ไม่ถูกต้องหรือหมดอายุ'; return; }
      AppState.tenant = Object.assign({}, r.data.tenant, { license_key });
      saveTenantSession(AppState.tenant);
      AppState.view = 'home'; render();
    } catch (ex) { errEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์กลางไม่สำเร็จ'; }
  }
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act],[data-guide],[data-svc],[data-qtab],[data-qvisit],[data-stab],[data-modal],[data-preset],[data-atab],[data-hot-icd],[data-add-icd],[data-dcat],[data-add-drug],[data-step-dec],[data-step-inc],[data-drug-del],[data-icd-del],[data-dose-idx],[data-pick-dose],[data-pick-preset],[data-del-preset],[data-fasting],[data-rate],[data-vhv-cid],[data-bp-idx],[data-ref],[data-del-user],[data-close]');
  if (!el) return;
  if (el.dataset.close && e.target === el) { AppState.modal = null; render(); return; }

  const act = el.dataset.act;
  if (act === 'close-modal') { if (AppState.currentAudio) try { AppState.currentAudio.pause(); } catch (x) {} AppState.modal = null; render(); return; }
  if (act === 'logo-secret') {
    AppState.adminClicks++;
    clearTimeout(AppState.adminClickTimer);
    AppState.adminClickTimer = setTimeout(() => { AppState.adminClicks = 0; }, 4000);
    if (AppState.adminClicks >= 5) { AppState.adminClicks = 0; AppState.modal = 'admin_pass'; render(); }
    return;
  }
  if (act === 'submit-adm-pass') {
    const pw = (document.getElementById('inpAdmPass').value || '').trim();
    const localPw = localStorage.getItem('mhs_admin_password') || 'Admin00000';
    let ok = (pw === localPw || pw === 'Admin00000');
    if (!ok && pw) {
      AppState.adminPin = pw;
      const r = await cloudFetch('/api/tenant/users');
      if (r.ok) { ok = true; sessionStorage.setItem('mhs_admin_pin', pw); AppState.tenantUsers = (r.data && r.data.users) || []; }
    }
    if (!ok) { document.getElementById('admPassErr').textContent = 'รหัสผ่านไม่ถูกต้อง!'; return; }
    AppState.modal = null; AppState.view = 'admin'; AppState.adminTab = 'settings'; speak('เข้าสู่โหมดผู้ดูแลระบบ'); render(); return;
  }
  if (act === 'open-vhv-login') { AppState.modal = 'vhv_login'; render(); return; }
  if (act === 'submit-vhv') {
    const cid = (document.getElementById('inpVhvCid').value || '').replace(/\D/g, '');
    const err = document.getElementById('vhvErr');
    if (cid.length !== 13) { err.textContent = 'กรุณากรอกเลขบัตร 13 หลัก'; return; }
    err.textContent = 'กำลังตรวจสอบ...';
    const r = await cloudFetch('/api/tenant/user-login', { method: 'POST', body: JSON.stringify({ cid }) });
    if (!r.ok || !r.data.success || !r.data.user) { err.textContent = (r.data && r.data.message) || 'ไม่พบรายชื่อในหน่วยงาน'; return; }
    const u = r.data.user;
    const roles = Array.isArray(u.roles) ? u.roles : String(u.role || '').split(',');
    const isStaff = roles.includes('staff') || roles.includes('tenant_admin');
    AppState.user = { cid: u.cid, name: u.full_name || u.name, roles, isStaff };
    AppState.modal = null;
    sendHeartbeat('online', false);
    if (isStaff) { resetPatientState(); AppState.view = 'staff'; fetchTodayQueue(); }
    render(); return;
  }
  if (act === 'user-logout') { sendHeartbeat('offline', false); AppState.user = null; resetPatientState(); AppState.view = 'home'; render(); return; }
  if (act === 'open-manual-cid') {
    if (!AppState.user) { alert('กรุณาลงชื่อเข้าปฏิบัติงาน อสม. ก่อนเริ่มให้บริการครับ'); AppState.modal = 'vhv_login'; render(); return; }
    AppState.modal = 'manual_cid'; render(); return;
  }
  if (act === 'submit-pat-cid') {
    const cid = (document.getElementById('inpPatCid').value || '').trim();
    const err = document.getElementById('patErr');
    err.textContent = 'กำลังค้นหาใน JHCIS...';
    const lr = await loadPatientByCid(cid);
    if (!lr.ok) { err.textContent = lr.msg; return; }
    AppState.modal = null;
    AppState.view = AppState.user.isStaff ? 'staff' : 'kiosk';
    if (AppState.user.isStaff) fetchTodayQueue();
    render(); return;
  }
  if (act === 'read-card') { AppState.showMoreMenu = false; readSmartcard(false); return; }
  if (act === 'go-staff') { AppState.view = 'staff'; fetchTodayQueue(); render(); return; }
  if (act === 'kiosk-home' || act === 'staff-home' || act === 'admin-home') {
    if (act === 'kiosk-home') sendHeartbeat('offline', false);
    resetPatientState(); AppState.showMoreMenu = false; AppState.view = 'home'; render(); return;
  }
  if (act === 'open-bt') { AppState.modal = 'bt'; render(); return; }
  if (act === 'open-telemed') { AppState.modal = 'telemed'; render(); return; }
  if (act === 'open-fasting') { AppState.modal = 'sugar_fasting'; render(); return; }
  if (act === 'guide-ble') { const t = AppState.modalData.type; AppState.modal = null; render(); await connectBLE(t, () => { checkCriticalBP(); triggerAI(); render(); }); return; }
  if (act === 'kiosk-save' || act === 'staff-save') { if (validateBeforeSave()) { AppState.modal = 'confirm_save'; render(); } return; }
  if (act === 'confirm-save-now') { executeSaveToJHCIS(); return; }
  if (act === 'submit-rating') {
    try { await jhcisFetch('/jhcis-api/rating', { method: 'POST', body: JSON.stringify({ cid: AppState.patient.cid, visitno: null, score: AppState.ratingScore }) }); } catch (x) {}
    AppState.modal = null; resetPatientState(); AppState.view = 'home'; render(); return;
  }
  if (act === 'toggle-sb') { if (window.innerWidth < 900) AppState.sidebarMobileOpen = !AppState.sidebarMobileOpen; else AppState.sidebarCollapsed = !AppState.sidebarCollapsed; render(); return; }
  if (act === 'close-mob-sb') { AppState.sidebarMobileOpen = false; render(); return; }
  if (act === 'toggle-more') { AppState.showMoreMenu = !AppState.showMoreMenu; render(); return; }
  if (act === 'refresh-queue') { AppState.showMoreMenu = false; fetchTodayQueue(); return; }
  if (act === 'toggle-time') { AppState.timeService = AppState.timeService === '1' ? '2' : '1'; render(); return; }
  if (act === 'fill-ga') { AppState.diagNote = 'GA: Alert, cooperative, HEENT: Not pale, Heart: Normal S1S2, Lung: Clear both lungs'; if (!AppState.customSymptoms.trim()) AppState.customSymptoms = 'ตรวจติดตามอาการทั่วไป'; render(); return; }
  if (act === 're-med') {
    if (!AppState.patient) return;
    const r = await jhcisFetch('/jhcis-api/re-med/' + AppState.patient.cid);
    if (r.ok && r.data && r.data.success) {
      if (r.data.allergies) AppState.drugAllergies = r.data.allergies;
      if (r.data.diagnote && !AppState.diagNote) AppState.diagNote = r.data.diagnote;
      if (r.data.diags && r.data.diags.length) AppState.icd10List = r.data.diags.map((d) => ({ diagcode: d.diagcode, diseasename: d.diseasename || '', dxtype: d.dxtype || '01', conti: '1', appointDate: '' }));
      if (r.data.drugs && r.data.drugs.length) AppState.drugList = r.data.drugs.map((d) => ({ drugcode: d.drugcode, drugname: d.drugname, unit: Number(d.unit) || 1, realprice: Number(d.realprice) || 0, costprice: Number(d.costprice) || 0, dose: d.dose || '', recorder: AppState.user.name }));
      alert('✅ ดึงข้อมูลยาและโรคครั้งล่าสุดเรียบร้อย'); render();
    }
    return;
  }
  if (act === 'add-preset') {
    const txt = (document.getElementById('preNewIn').value || '').trim();
    if (!txt) return;
    const isCC = AppState.modalData.target === 'symptoms';
    if (isCC) { AppState.ccPresets.unshift(txt); localStorage.setItem('jhcis_symptoms_presets', JSON.stringify(AppState.ccPresets)); }
    else { AppState.piPresets.unshift(txt); localStorage.setItem('jhcis_symptomsco_presets', JSON.stringify(AppState.piPresets)); }
    render(); return;
  }
  if (act === 'clear-preset') { if (AppState.modalData.target === 'symptoms') AppState.customSymptoms = ''; else AppState.customSymptomsco = ''; render(); return; }
  if (act === 'save-dose') { const idx = AppState.modalData.idx; if (AppState.drugList[idx]) AppState.drugList[idx].dose = (document.getElementById('shDoseTxt').value || '').trim(); AppState.modal = null; render(); return; }
  if (act === 'adm-save-settings') {
    const hn = (document.getElementById('admHospName').value || '').trim();
    const np = (document.getElementById('admNewPass').value || '').trim();
    if (hn) { AppState.customHospName = hn; localStorage.setItem('custom_hosp_name', hn); }
    if (np) localStorage.setItem('mhs_admin_password', np);
    alert('✅ บันทึกการตั้งค่าเรียบร้อยแล้ว'); render(); return;
  }
  if (act === 'adm-reset-media') { localStorage.removeItem('custom_logo'); localStorage.removeItem('custom_video'); localStorage.removeItem('custom_hosp_name'); AppState.customLogo = '/logo.png'; AppState.customVideo = '/bg-video.mp4'; AppState.customHospName = ''; alert('✅ คืนค่าเดิมแล้ว'); render(); return; }
  if (act === 'switch-tenant') { if (confirm('ยืนยันออกจากเซสชันสถานบริการนี้?')) { clearTenantSession(); AppState.tenant = null; AppState.user = null; AppState.view = 'tenant_login'; render(); } return; }
  if (act === 'adm-load-cloud') {
    AppState.adminPin = (document.getElementById('admCloudPin').value || '').trim();
    sessionStorage.setItem('mhs_admin_pin', AppState.adminPin);
    const r = await cloudFetch('/api/tenant/users');
    if (r.ok) {
      AppState.tenantUsers = r.data.users || r.data.data || [];
      render();
    } else {
      alert('โหลดไม่สำเร็จ: ' + ((r.data && (r.data.message || r.data.error)) || ('HTTP ' + r.status)));
    }
    return;
  }
  if (act === 'adm-add-user') {
    const pinEl = document.getElementById('admCloudPin');
    const pinVal = (pinEl && pinEl.value ? pinEl.value : AppState.adminPin || '').trim();
    if (!pinVal) { alert('กรุณากรอกรหัส PIN Admin หน่วยงานก่อนบันทึก'); return; }
    AppState.adminPin = pinVal;
    sessionStorage.setItem('mhs_admin_pin', pinVal);

    const cidEl = document.getElementById('nuCid');
    const nameEl = document.getElementById('nuName');
    const cid = (cidEl ? cidEl.value : '').replace(/\D/g, '');
    const full_name = (nameEl ? nameEl.value : '').trim();
    const roles = [
      document.getElementById('nuStaff')?.checked && 'staff',
      document.getElementById('nuVhv')?.checked && 'vhv',
      document.getElementById('nuAdmin')?.checked && 'tenant_admin'
    ].filter(Boolean).join(',');

    if (cid.length !== 13 || !full_name || !roles) {
      alert('กรอกเลขบัตร 13 หลัก ชื่อ-สกุล และเลือกบทบาทให้ครบ');
      return;
    }

    const oldTxt = el.textContent;
    el.disabled = true;
    el.textContent = 'กำลังบันทึก...';
    try {
      const r = await cloudFetch('/api/tenant/users', {
        method: 'POST',
        body: JSON.stringify({ cid, full_name, role: roles, position: '', village_no: '', phone: '' })
      });
      if (r.ok) {
        alert('✅ บันทึกบุคลากรสำเร็จ');
        const u = await cloudFetch('/api/tenant/users');
        if (u.ok) AppState.tenantUsers = u.data.users || u.data.data || [];
        render();
      } else {
        alert('บันทึกไม่สำเร็จ: ' + ((r.data && (r.data.message || r.data.error)) || ('HTTP ' + r.status)));
      }
    } finally {
      el.disabled = false;
      el.textContent = oldTxt;
    }
    return;
  }
  if (act === 'adm-upload-csv') {
    const pinVal = (document.getElementById('admCloudPin').value || '').trim();
    if (!pinVal) { alert('กรุณากรอกรหัส PIN Admin หน่วยงานก่อนนำเข้า'); return; }
    AppState.adminPin = pinVal;
    sessionStorage.setItem('mhs_admin_pin', pinVal);
    if (!AppState.excelRows.length) { alert('กรุณาเลือกไฟล์ CSV ก่อน'); return; }
    const r = await cloudFetch('/api/tenant/users/bulk-import', { method: 'POST', body: JSON.stringify({ users: AppState.excelRows }) });
    if (r.ok) {
      alert('✅ นำเข้าสำเร็จ ' + AppState.excelRows.length + ' รายชื่อ');
      const u = await cloudFetch('/api/tenant/users');
      if (u.ok) AppState.tenantUsers = u.data.users || u.data.data || [];
      render();
    } else {
      alert('นำเข้าไม่สำเร็จ: ' + ((r.data && (r.data.message || r.data.error)) || ('HTTP ' + r.status)));
    }
    return;
  }
  if (act === 'adm-clear-offline') { if (confirm('ยืนยันลบคิวค้างส่งทั้งหมด?')) { AppState.offlineQueue = []; localStorage.setItem('offline_queue', '[]'); render(); } return; }
  if (act === 'adm-sync-offline') {
    const rem = [];
    for (const item of AppState.offlineQueue) {
      try { const r = await jhcisFetch('/jhcis-api/queue', { method: 'POST', body: JSON.stringify(item) }); if (!r.ok) rem.push(item); } catch (x) { rem.push(item); }
    }
    AppState.offlineQueue = rem; localStorage.setItem('offline_queue', JSON.stringify(rem));
    alert(rem.length === 0 ? '✅ ซิงค์ข้อมูลค้างส่งครบทุกรายการ!' : ('เหลือค้างส่ง ' + rem.length + ' รายการ')); render(); return;
  }
  if (act === 'adm-copy-word' && AppState.analytics) {
    const a = AppState.analytics;
    const t = (a.usage && a.usage.total) || 0;
    const txt = (a.summary || '') + (t > 0 ? (' ช่วงอายุ: 0-15 ปี ' + (a.ageGroups.gen1/t*100).toFixed(1) + '%, 16-35 ปี ' + (a.ageGroups.gen2/t*100).toFixed(1) + '%, 36-60 ปี ' + (a.ageGroups.gen3/t*100).toFixed(1) + '%, 60+ ปี ' + (a.ageGroups.gen4/t*100).toFixed(1) + '%') : '');
    navigator.clipboard.writeText(txt).then(() => alert('📋 คัดลอกสรุปผลวิจัยเรียบร้อย!')); return;
  }
  if (act === 'save-bp-follow' && AppState.selectedBp) {
    let nt = (document.getElementById('bpFollowIn').value || '').trim();
    if (AppState.referStatus === 'refer') nt = '[REFER] ' + nt;
    else if (AppState.referStatus === 'norefer') nt = '[NOREFER] ' + nt;
    await jhcisFetch('/jhcis-api/bp-followup', { method: 'POST', body: JSON.stringify({ log_id: AppState.selectedBp.log_id, note: nt }) });
    AppState.modal = null;
    const r = await jhcisFetch('/jhcis-api/bp-monitor?date=' + AppState.bpDate);
    if (r.ok && r.data.success) AppState.bpData = r.data.data || [];
    render(); return;
  }

  // Data-attribute shortcuts
  if (el.dataset.guide) {
    const gMap = {
      bp: { type:'bp', title:'วิธีวัดความดันโลหิต', gif:'/guide-bp.gif', desc:'สอดแขนเข้าไปให้พอดีข้อพับ วางแขนราบบนโต๊ะ นั่งหลังตรง แล้วอยู่นิ่งๆ นะคะ' },
      o2: { type:'o2', title:'วิธีวัดออกซิเจนปลายนิ้ว', gif:'/guide-o2.gif', desc:'สอดนิ้วชี้เข้าไปให้สุด วางมือราบกับโต๊ะ แล้วอยู่นิ่งๆ ห้ามขยับนิ้วค่ะ' },
      weight: { type:'weight', title:'วิธีชั่งน้ำหนัก', gif:'/guide-weight.gif', desc:'ถอดรองเท้า แล้วก้าวขึ้นยืนบนเครื่องชั่งน้ำหนักให้เต็มเท้าทั้งสองข้างค่ะ' },
      temp: { type:'temp', title:'วิธีวัดอุณหภูมิ', gif:'/guide-temp.gif', desc:'นำเครื่องวัดจ่อที่หน้าผาก ห่างประมาณ 3 เซนติเมตร แล้วกดปุ่มวัดค่ะ' },
      sugar: { type:'sugar', title:'วิธีวัดน้ำตาลในเลือด', gif:'/guide-sugar.gif', desc:'เปลี่ยนเข็มใหม่ทุกครั้ง เจาะด้านข้างปลายนิ้ว แล้วแตะเลือดลงแผ่นตรวจค่ะ' }
    };
    AppState.modalData = gMap[el.dataset.guide]; AppState.modal = 'guide'; speak(AppState.modalData.desc); render(); return;
  }
  if (el.dataset.svc) { AppState.serviceType = el.dataset.svc; render(); return; }
  if (el.dataset.qtab) { AppState.queueFilter = el.dataset.qtab; render(); return; }
  if (el.dataset.qvisit) { loadQueueVisit(el.dataset.qvisit, el.dataset.qcid); return; }
  if (el.dataset.stab) {
    AppState.staffTab = el.dataset.stab;
    if (el.dataset.stab === 'history' && AppState.patient) {
      jhcisFetch('/jhcis-api/patient-history/' + AppState.patient.cid).then((r) => { if (r.ok && r.data.success) { AppState.patientHistory = r.data.data || []; render(); } });
    }
    render(); return;
  }
  if (el.dataset.modal) { AppState.modal = el.dataset.modal; render(); return; }
  if (el.dataset.preset) { AppState.modalData = { target: el.dataset.preset, q: '' }; AppState.modal = 'preset'; render(); return; }
  if (el.dataset.pickPreset) {
    const t = el.dataset.pickPreset;
    if (AppState.modalData.target === 'symptoms') AppState.customSymptoms = AppState.customSymptoms.trim() ? (AppState.customSymptoms.trim() + ' ' + t) : t;
    else AppState.customSymptomsco = AppState.customSymptomsco.trim() ? (AppState.customSymptomsco.trim() + ' ' + t) : t;
    render(); return;
  }
  if (el.dataset.delPreset != null) {
    const i = Number(el.dataset.delPreset);
    if (AppState.modalData.target === 'symptoms') { AppState.ccPresets.splice(i, 1); localStorage.setItem('jhcis_symptoms_presets', JSON.stringify(AppState.ccPresets)); }
    else { AppState.piPresets.splice(i, 1); localStorage.setItem('jhcis_symptomsco_presets', JSON.stringify(AppState.piPresets)); }
    render(); return;
  }
  if (el.dataset.fasting) { AppState.sugarFasting = el.dataset.fasting; AppState.modal = null; render(); return; }
  if (el.dataset.rate) { AppState.ratingScore = Number(el.dataset.rate); render(); return; }
  if (el.dataset.hotIcd) { AppState.icdSearch = el.dataset.hotIcd; const r = await jhcisFetch('/jhcis-api/search-icd10?q=' + encodeURIComponent(AppState.icdSearch)); AppState.icdResults = (r.ok && r.data.data) || []; render(); return; }
  if (el.dataset.addIcd != null) {
    const row = AppState.icdResults[Number(el.dataset.addIcd)];
    if (row && !AppState.icd10List.some((x) => x.diagcode === row.diseasecode)) {
      AppState.icd10List.push({ diagcode: row.diseasecode, diseasename: row.diseasenamethai || row.diseasename || '', dxtype: AppState.icd10List.length === 0 ? '01' : '02', conti: '0', appointDate: '' });
    }
    AppState.modal = null; render(); return;
  }
  if (el.dataset.icdDel != null) { AppState.icd10List.splice(Number(el.dataset.icdDel), 1); render(); return; }
  if (el.dataset.dcat) { AppState.drugCategory = el.dataset.dcat; const r = await jhcisFetch('/jhcis-api/search-drug?q=' + encodeURIComponent(AppState.drugSearch) + '&category=' + AppState.drugCategory); AppState.drugResults = (r.ok && r.data.data) || []; render(); return; }
  if (el.dataset.addDrug != null) {
    const d = AppState.drugResults[Number(el.dataset.addDrug)];
    if (d) {
      const alg = AppState.drugAllergies.find((a) => a.drugcode === d.drugcode || (d.drugname && a.drugname && d.drugname.toLowerCase().includes(a.drugname.toLowerCase().split(' ')[0])));
      if (alg && !confirm('⚠️ คำเตือนประวัติแพ้ยา! ผู้ป่วยแพ้ ' + alg.drugname + '\nยืนยันสั่งจ่าย ' + d.drugname + ' หรือไม่?')) return;
      AppState.drugList.push({ drugcode: d.drugcode, drugname: d.drugname, unit: 1, realprice: Number(d.realprice) || 0, costprice: Number(d.costprice) || 0, dose: '', recorder: (AppState.user && AppState.user.name) || 'เจ้าหน้าที่' });
    }
    AppState.modal = null; render(); return;
  }
  if (el.dataset.stepDec != null) { const d = AppState.drugList[Number(el.dataset.stepDec)]; if (d) d.unit = Math.max(1, d.unit - 1); render(); return; }
  if (el.dataset.stepInc != null) { const d = AppState.drugList[Number(el.dataset.stepInc)]; if (d) d.unit += 1; render(); return; }
  if (el.dataset.drugDel != null) { AppState.drugList.splice(Number(el.dataset.drugDel), 1); render(); return; }
  if (el.dataset.doseIdx != null) { AppState.modalData = { idx: Number(el.dataset.doseIdx) }; AppState.modal = 'sheet_dose'; render(); return; }
  if (el.dataset.pickDose) { const ta = document.getElementById('shDoseTxt'); if (ta) ta.value = el.dataset.pickDose; return; }
  if (el.dataset.atab) {
    AppState.adminTab = el.dataset.atab; render();
    if (el.dataset.atab === 'vhv') jhcisFetch('/jhcis-api/vhv-stats').then((r) => { if (r.ok && r.data.success) { AppState.vhvStats = r.data.data || []; render(); } });
    if (el.dataset.atab === 'analytics') jhcisFetch('/jhcis-api/analytics').then((r) => { if (r.ok && r.data.success) { AppState.analytics = r.data.data; render(); } });
    if (el.dataset.atab === 'bp') jhcisFetch('/jhcis-api/bp-monitor?date=' + AppState.bpDate).then((r) => { if (r.ok && r.data.success) { AppState.bpData = r.data.data || []; render(); } });
    return;
  }
  if (el.dataset.vhvCid) {
    AppState.selectedVhvName = el.dataset.vhvName; AppState.vhvLogs = []; AppState.modal = 'vhv_logs'; render();
    const r = await jhcisFetch('/jhcis-api/vhv-logs/' + el.dataset.vhvCid + '?t=' + Date.now());
    if (r.ok && r.data.success) { AppState.vhvLogs = r.data.data || []; render(); }
    return;
  }
  if (el.dataset.bpIdx != null) {
    const it = AppState.bpData[Number(el.dataset.bpIdx)];
    if (!it) return;
    AppState.selectedBp = it;
    let raw = it.follow_up_note || '';
    if (raw.startsWith('[REFER] ')) { AppState.referStatus = 'refer'; raw = raw.slice(8); }
    else if (raw.startsWith('[NOREFER] ')) { AppState.referStatus = 'norefer'; raw = raw.slice(10); }
    else AppState.referStatus = '';
    AppState.followNote = raw || ('ติดตามอาการที่ ' + getHospDisplay() + ' ');
    AppState.modal = 'bp_follow'; render(); return;
  }
  if (el.dataset.ref) { AppState.referStatus = el.dataset.ref; render(); return; }
  if (el.dataset.delUser) {
    if (confirm('ยืนยันลบบุคลากร ' + el.dataset.delUser + '?')) {
      await cloudFetch('/api/tenant/users/' + el.dataset.delUser, { method: 'DELETE' });
      const u = await cloudFetch('/api/tenant/users'); if (u.ok) AppState.tenantUsers = u.data.users || []; render();
    }
  }
});

document.addEventListener('input', async (e) => {
  const el = e.target;
  if (el.dataset.vital) {
    const f = el.dataset.vital;
    let v = el.value;
    if (f === 'sysDia') {
      v = v.replace(/[^\d/]/g, '');
      if (v.length === 3 && v.indexOf('/') < 0 && e.inputType !== 'deleteContentBackward') v += '/';
      if (v.split('/').length > 2) v = v.slice(0, -1);
      el.value = v;
    }
    AppState.vitals[f] = v;
    recalcVitals(); checkCriticalBP(); triggerAI();
    if (f === 'weight' || f === 'height') {
      const bEl = document.querySelector('[data-vital="bmi"]');
      if (bEl) bEl.value = AppState.vitals.bmi;
    }
    return;
  }
  if (el.dataset.bind) { AppState[el.dataset.bind] = el.value; if (el.dataset.bind === 'queueSearch') render(); return; }
  if (el.id === 'preCurVal') { if (AppState.modalData.target === 'symptoms') AppState.customSymptoms = el.value; else AppState.customSymptomsco = el.value; return; }
  if (el.id === 'preSearchIn') { AppState.modalData.q = el.value; render(); return; }
  if (el.id === 'shIcdIn') { AppState.icdSearch = el.value; if (el.value.trim().length >= 2) { const r = await jhcisFetch('/jhcis-api/search-icd10?q=' + encodeURIComponent(el.value.trim())); AppState.icdResults = (r.ok && r.data.data) || []; render(); } return; }
  if (el.id === 'shDrugIn') { AppState.drugSearch = el.value; if (el.value.trim().length >= 1) { const r = await jhcisFetch('/jhcis-api/search-drug?q=' + encodeURIComponent(el.value.trim()) + '&category=' + AppState.drugCategory); AppState.drugResults = (r.ok && r.data.data) || []; render(); } return; }
  if (el.dataset.stepVal != null) { const d = AppState.drugList[Number(el.dataset.stepVal)]; if (d) d.unit = Math.max(1, Number(el.value) || 1); render(); }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.bind) { AppState[el.dataset.bind] = el.value; render(); return; }
  if (el.dataset.btSw) {
    const k = el.dataset.btSw;
    if (el.checked) await connectBLE(k, () => { checkCriticalBP(); triggerAI(); render(); });
    else { AppState.devices[k] = ''; localStorage.setItem('dev_' + k, ''); render(); }
    return;
  }
  if (el.id === 'inpPhotoUpload') { handlePhotoUploadFile(el.files && el.files[0]); return; }
  if (el.id === 'admLogoFile' && el.files[0]) { const r = new FileReader(); r.onloadend = () => { AppState.customLogo = r.result; localStorage.setItem('custom_logo', r.result); render(); }; r.readAsDataURL(el.files[0]); return; }
  if (el.id === 'admVideoFile' && el.files[0]) {
    if (el.files[0].size > 6 * 1024 * 1024) { alert('⚠️ ไฟล์วิดีโอใหญ่เกิน 5-6 MB'); return; }
    const r = new FileReader(); r.onloadend = () => { AppState.customVideo = r.result; try { localStorage.setItem('custom_video', r.result); } catch (x) {} render(); }; r.readAsDataURL(el.files[0]); return;
  }
  if (el.id === 'admCsvFile' && el.files[0]) {
    const txt = await el.files[0].text();
    const lines = txt.split(/\r?\n/).filter(Boolean);
    AppState.excelRows = lines.slice(1).map((ln) => { const c = ln.split(',').map((s) => s.trim().replace(/^"|"$/g, '')); return { cid: c[0], full_name: c[1], role: c[2] || 'vhv' }; }).filter((x) => x.cid && x.cid.length === 13);
    alert('อ่านรายชื่อจากไฟล์ได้ ' + AppState.excelRows.length + ' รายชื่อ'); return;
  }
  if (el.id === 'admBpDate') { AppState.bpDate = el.value; const r = await jhcisFetch('/jhcis-api/bp-monitor?date=' + el.value); if (r.ok && r.data.success) AppState.bpData = r.data.data || []; render(); return; }
  if (el.dataset.icdDx != null) { AppState.icd10List[Number(el.dataset.icdDx)].dxtype = el.value; return; }
  if (el.dataset.icdConti != null) { AppState.icd10List[Number(el.dataset.icdConti)].conti = el.checked ? '1' : '0'; return; }
  if (el.dataset.icdDate != null) { AppState.icd10List[Number(el.dataset.icdDate)].appointDate = el.value; }
});

document.addEventListener('focusin', (e) => {
  if (e.target.dataset && e.target.dataset.vital === 'sugar' && AppState.view === 'kiosk' && !AppState.sugarFasting) {
    e.target.blur(); AppState.modal = 'sugar_fasting'; render();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && AppState.modal) { AppState.modal = null; render(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && AppState.view === 'staff' && AppState.patient) {
    e.preventDefault(); if (validateBeforeSave()) { AppState.modal = 'confirm_save'; render(); }
  }
  if (e.key === 'Enter') {
    if (e.target.id === 'inpVhvCid') document.querySelector('[data-act="submit-vhv"]')?.click();
    if (e.target.id === 'inpPatCid') document.querySelector('[data-act="submit-pat-cid"]')?.click();
    if (e.target.id === 'inpAdmPass') document.querySelector('[data-act="submit-adm-pass"]')?.click();
  }
});

// ==================== BACKGROUND AUTOMATIONS ====================
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (AppState.view === 'kiosk') { speak('หมดเวลาทำรายการ ระบบได้ล้างข้อมูลเพื่อความปลอดภัยแล้วค่ะ'); resetPatientState(); AppState.view = 'home'; render(); }
  }, 600000);
}
['mousemove', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
resetIdle();

setInterval(() => {
  const c1 = document.getElementById('liveThaiClock'); if (c1) c1.textContent = formatThaiNow();
  const c2 = document.getElementById('staffClock'); if (c2) c2.textContent = new Date().toTimeString().slice(0, 8);
}, 1000);

setInterval(() => { if (AppState.view === 'home' && AppState.user && !AppState.modal && !isPollingCard) { isPollingCard = true; readSmartcard(true).finally(() => { isPollingCard = false; }); } }, 2500);
setInterval(() => { if (AppState.view === 'staff') fetchTodayQueue(); }, 15000);
setInterval(() => { if (AppState.view === 'admin' && AppState.adminTab === 'vhv') jhcisFetch('/jhcis-api/vhv-stats').then((r) => { if (r.ok && r.data.success) { AppState.vhvStats = r.data.data || []; render(); } }); }, 3000);
setInterval(() => { sendHeartbeat('online', false); }, 10000);
setInterval(async () => {
  if (isHuntingBP || (AppState.view !== 'kiosk' && AppState.view !== 'staff') || !navigator.bluetooth || !navigator.bluetooth.getDevices) return;
  try {
    const dev = (await navigator.bluetooth.getDevices()).find((d) => d.name && d.name.includes('YUWELL'));
    if (!dev || (dev.gatt && dev.gatt.connected)) return;
    isHuntingBP = true;
    const ch = await (await (await dev.gatt.connect()).getPrimaryService('blood_pressure')).getCharacteristic('blood_pressure_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', (ev) => {
      const bp = parseBPData(new DataView(ev.target.value.buffer));
      AppState.vitals.sysDia = bp.sys + '/' + bp.dia; AppState.vitals.pulse = bp.pulse;
      speak('วัดความดันเสร็จสิ้น ความดันโลหิต ' + bp.sys + ' ตัวล่าง ' + bp.dia + ' ชีพจร ' + bp.pulse + ' ครั้งต่อนาทีค่ะ');
      checkCriticalBP(); triggerAI(); render();
    });
    dev.addEventListener('gattserverdisconnected', () => { isHuntingBP = false; }, { once: true });
  } catch (e) { isHuntingBP = false; }
}, 3000);

window.addEventListener('beforeunload', () => sendHeartbeat('offline', true));
window.addEventListener('pagehide', () => sendHeartbeat('offline', true));

render();
