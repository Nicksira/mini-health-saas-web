import './styles/app.css';
import { CLOUD_BASE_URL, STORAGE_KEYS, VALID_ROLES } from './config/constants.js';
import {
  verifyTenantLicense,
  tenantUserLogin,
  fetchTenantPresets,
  listTenantUsers,
  createTenantUser,
  bulkImportTenantUsers,
  deleteTenantUser,
  createTenantPreset,
  deleteTenantPreset
} from './services/cloudApi.js';
import {
  checkConnectorHealth,
  fetchTodayQueue,
  fetchVisitDetail,
  fetchPatientByCid,
  fetchPatientHistory,
  fetchReMed,
  searchIcd10,
  searchDrug,
  saveQueueVisit,
  analyzeAiVitals,
  submitRating,
  fetchResearchAnalytics,
  vhvLoginByCid,
  sendVhvHeartbeat,
  fetchVhvStats,
  fetchBpMonitor,
  saveBpFollowup,
  readSmartCardBridge
} from './services/connectorApi.js';
import { getOfflineQueue, enqueueOfflineItem, flushOfflineQueue } from './services/offlineQueue.js';
import { parseUsersExcelFile } from './services/excelImport.js';
import { renderTenantLoginView } from './components/TenantLoginView.js';
import { renderStaffClinicalWorkspace } from './components/StaffClinicalWorkspace.js';
import { renderVhvKioskView } from './components/VhvKioskView.js';
import { renderTenantAdminView } from './components/TenantAdminView.js';
import './styles/apple-ui.css';
import { initSuperFeatures } from './modules/kioskSuperFeatures.js';

const appEl = document.getElementById('app');
const ADMIN_PIN_SESSION_KEY = 'mhs_admin_pin_v3';

const state = {
  tenantSession: loadJson(STORAGE_KEYS.TENANT_SESSION, null),
  staffUser: loadJson(STORAGE_KEYS.STAFF_SESSION, null),
  vhvUser: loadJson(STORAGE_KEYS.VHV_SESSION, null),
  presets: loadJson(STORAGE_KEYS.PRESETS_CACHE, []),
  activeMode: localStorage.getItem(STORAGE_KEYS.ACTIVE_MODE) || 'staff',
  connectorOnline: false,
  todayQueue: [],
  currentVisitno: null,
  currentPatient: null,
  selectedIcds: [],
  selectedDrugs: [],
  lastDrugSearchResults: [],
  ratingScore: 5,
  adminPin: sessionStorage.getItem(ADMIN_PIN_SESSION_KEY) || '',
  adminUsersList: loadJson(STORAGE_KEYS.USERS_CACHE, []),
  parsedExcelUsers: [],
  vhvHeartbeatTimer: null
};

// ==============================================================================
// SHARED HELPERS (Multi-Role, Presets, Storage, Escaping)
// ==============================================================================
function loadJson(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJson(key, val) {
  if (val === null || val === undefined) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(val));
  }
}

function setAdminPin(pin) {
  state.adminPin = String(pin || '').trim();
  if (state.adminPin) {
    sessionStorage.setItem(ADMIN_PIN_SESSION_KEY, state.adminPin);
  } else {
    sessionStorage.removeItem(ADMIN_PIN_SESSION_KEY);
  }
}

function parseRoles(roleInput) {
  const rawList = Array.isArray(roleInput)
    ? roleInput
    : String(roleInput || '').split(/[,|/;]+/);
  return Array.from(
    new Set(
      rawList
        .map((r) => {
          const v = String(r || '').trim().toLowerCase();
          if (v === 'admin' || v === 'ผู้ดูแล' || v === 'ผู้ดูแลหน่วยงาน' || v === 'แอดมิน') return 'tenant_admin';
          if (v === 'เจ้าหน้าที่') return 'staff';
          if (v === 'อสม' || v === 'อสม.') return 'vhv';
          return v;
        })
        .filter((v) => VALID_ROLES.includes(v))
    )
  );
}

function hasAnyRole(userOrRole, allowedRoles = []) {
  const raw = typeof userOrRole === 'object' && userOrRole !== null
    ? (userOrRole.roles || userOrRole.role)
    : userOrRole;
  const list = parseRoles(raw);
  return allowedRoles.some((target) => list.includes(String(target).toLowerCase()));
}

function formatRoleBadges(roleInput) {
  const labelMap = {
    staff: 'เจ้าหน้าที่',
    tenant_admin: 'ผู้ดูแลหน่วยงาน',
    vhv: 'อสม.'
  };
  const roles = parseRoles(roleInput);
  if (!roles.length) return '<span class="muted">-</span>';
  return roles
    .map((r) => `<span class="pill pill-role">${esc(labelMap[r] || r)}</span>`)
    .join('');
}

function normalizeUserForApi(u) {
  const fullName = String(u?.full_name ?? u?.name ?? u?.fullname ?? '').trim();
  const roles = parseRoles(u?.roles ?? u?.role ?? 'vhv');
  const finalRoles = roles.length ? roles : ['vhv'];
  return {
    cid: String(u?.cid ?? u?.idcard ?? '').replace(/\D/g, '').trim(),
    name: fullName,
    full_name: fullName,
    role: finalRoles.join(','),
    roles: finalRoles,
    position: String(u?.position || '').trim(),
    village_no: String(u?.village_no || '').trim(),
    phone: String(u?.phone || '').trim()
  };
}

function formatPresetCategory(cat) {
  const map = {
    symptoms: 'อาการสำคัญ (CC)',
    cc: 'อาการสำคัญ (CC)',
    symptomsco: 'อาการร่วม (PI)',
    diagnote: 'บันทึกแพทย์',
    note: 'บันทึกแพทย์',
    dose: 'วิธีใช้ยา'
  };
  return map[String(cat || '').toLowerCase()] || cat || '-';
}

function stopVhvHeartbeat() {
  if (state.vhvHeartbeatTimer) {
    clearInterval(state.vhvHeartbeatTimer);
    state.vhvHeartbeatTimer = null;
  }
}

function setMode(mode) {
  if (state.activeMode === 'vhv' && mode !== 'vhv') {
    stopVhvHeartbeat();
  }
  state.activeMode = mode;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, mode);
  renderApp();
}

async function refreshConnectorStatus() {
  if (!state.tenantSession?.api_url) {
    state.connectorOnline = false;
    updateConnectorPill();
    return;
  }
  try {
    await checkConnectorHealth(state.tenantSession);
    state.connectorOnline = true;
    await flushOfflineQueue(state.tenantSession);
  } catch (_) {
    state.connectorOnline = false;
  }
  updateConnectorPill();
}

function updateConnectorPill() {
  const pill = document.getElementById('topConnectorPill');
  if (!pill) return;
  if (state.connectorOnline) {
    pill.className = 'pill pill-online';
    pill.textContent = 'Connector: ออนไลน์';
  } else {
    pill.className = 'pill pill-offline';
    pill.textContent = 'Connector: ออฟไลน์ / รอเชื่อมต่อ';
  }
}

function renderTopBar() {
  const t = state.tenantSession;
  if (!t) {
    return `
      <header class="topbar">
        <div class="topbar-inner">
          <div>
            <div class="brand-title">Mini Health Station SaaS</div>
            <div class="brand-sub">Multi-Tenant Hybrid PWA (PDPA Compliant)</div>
          </div>
          <span class="pill pill-info">กรุณาลงชื่อเข้าใช้สถานบริการ</span>
        </div>
      </header>
    `;
  }

  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div>
          <div class="brand-title">${esc(t.hosp_name)} (${esc(t.hospcode)})</div>
          <div class="brand-sub">License หมดอายุ: ${esc(t.expires_at || '-')}</div>
        </div>

        <nav class="mode-switch" aria-label="สลับโหมดการทำงาน">
          <button type="button" class="mode-btn ${state.activeMode === 'staff' ? 'active' : ''}" data-set-mode="staff">โหมดเจ้าหน้าที่</button>
          <button type="button" class="mode-btn ${state.activeMode === 'vhv' ? 'active' : ''}" data-set-mode="vhv">โหมด อสม. (Kiosk)</button>
          <button type="button" class="mode-btn ${state.activeMode === 'admin' ? 'active' : ''}" data-set-mode="admin">Admin หน่วยงาน</button>
        </nav>

        <div class="topbar-right">
          <span class="pill ${state.connectorOnline ? 'pill-online' : 'pill-offline'}" id="topConnectorPill">
            ${state.connectorOnline ? 'Connector: ออนไลน์' : 'Connector: ออฟไลน์'}
          </span>
        </div>
      </div>
    </header>
  `;
}

function renderApp() {
  if (!state.tenantSession) {
    stopVhvHeartbeat();
    appEl.innerHTML = `<div class="app-shell">${renderTopBar()}<main class="container">${renderTenantLoginView()}</main></div>`;
    bindTenantLoginEvents();
    return;
  }

  let bodyHtml = '';
  if (state.activeMode === 'staff') {
    bodyHtml = renderStaffBody();
  } else if (state.activeMode === 'vhv') {
    bodyHtml = renderVhvBody();
  } else {
    bodyHtml = renderAdminBody();
  }

  appEl.innerHTML = `<div class="app-shell">${renderTopBar()}<main class="container">${bodyHtml}</main></div>`;
  bindCommonTopbarEvents();

  if (state.activeMode === 'staff') bindStaffEvents();
  else if (state.activeMode === 'vhv') bindVhvEvents();
  else bindAdminEvents();
}

function bindCommonTopbarEvents() {
  document.querySelectorAll('[data-set-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.getAttribute('data-set-mode')));
  });
}

// ==============================================================================
// 1. TENANT LOGIN EVENTS
// ==============================================================================
function bindTenantLoginEvents() {
  const form = document.getElementById('tenantLoginForm');
  const errBox = document.getElementById('tlError');
  const submitBtn = document.getElementById('tlSubmitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังตรวจสอบ License...';

    try {
      const hospcode = document.getElementById('tlHospcode').value.trim();
      const licenseKey = document.getElementById('tlLicenseKey').value.trim();
      const cloudBaseUrl = (document.getElementById("tlCloudUrl")?.value || "https://mini-health-saas-cloud.sirapop-nick.workers.dev").trim() || CLOUD_BASE_URL;

      const session = await verifyTenantLicense({ hospcode, licenseKey, clientType: 'pwa', cloudBaseUrl });
      state.tenantSession = { ...session, cloud_base_url: cloudBaseUrl, license_key: licenseKey };
      saveJson(STORAGE_KEYS.TENANT_SESSION, state.tenantSession);

      try {
        const presets = await fetchTenantPresets({
          hospcode: state.tenantSession.hospcode,
          licenseKey: state.tenantSession.license_key,
          cloudBaseUrl
        });
        state.presets = presets;
        saveJson(STORAGE_KEYS.PRESETS_CACHE, presets);
      } catch (_) {}

      await refreshConnectorStatus();
      renderApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ตรวจสอบ License และเข้าใช้งาน';
    }
  });
}

// ==============================================================================
// 2. STAFF CLINICAL WORKSPACE
// ==============================================================================
function renderStaffBody() {
  if (!state.staffUser) {
    return `
      <div class="card" style="max-width:460px;margin:20px auto;">
        <h2 class="card-title">เข้าสู่ระบบโต๊ะตรวจเจ้าหน้าที่</h2>
        <p class="muted">ตรวจสอบสิทธิ์บุคลากรผ่านระบบกลางของหน่วยงาน (${esc(state.tenantSession.hospcode)})</p>
        <form id="staffLoginForm">
          <div class="field">
            <label for="staffLoginCid">เลขบัตรประชาชนเจ้าหน้าที่ (13 หลัก)</label>
            <input type="text" id="staffLoginCid" maxlength="13" required placeholder="กรอกเลขบัตร 13 หลัก" />
          </div>
          <div id="staffLoginError" class="alert-banner alert-red" style="display:none;"></div>
          <button type="submit" class="btn btn-primary" style="width:100%;" id="staffLoginSubmitBtn">เข้าสู่หน้าโต๊ะตรวจทันที</button>
        </form>
      </div>
    `;
  }
  return renderStaffClinicalWorkspace({
    staffUser: state.staffUser,
    tenantSession: state.tenantSession,
    presets: state.presets
  });
}

function bindStaffEvents() {
  if (!state.staffUser) {
    const form = document.getElementById('staffLoginForm');
    const errBox = document.getElementById('staffLoginError');
    const submitBtn = document.getElementById('staffLoginSubmitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      const cid = document.getElementById('staffLoginCid').value.replace(/\D/g, '').trim();
      if (cid.length !== 13) {
        errBox.textContent = 'กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก';
        errBox.style.display = 'block';
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังตรวจสอบสิทธิ์...';
      }

      try {
        const user = await tenantUserLogin({
          hospcode: state.tenantSession.hospcode,
          licenseKey: state.tenantSession.license_key,
          cid,
          expectedRole: 'staff',
          cloudBaseUrl: state.tenantSession.cloud_base_url
        });

        if ((user.role || user.roles) && !hasAnyRole(user, ['staff', 'tenant_admin'])) {
          throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานโต๊ะตรวจเจ้าหน้าที่');
        }

        const displayName = user.full_name || user.name || user.fullname || `เจ้าหน้าที่ ${cid}`;
        state.staffUser = {
          ...user,
          cid: user.cid || cid,
          name: displayName,
          full_name: displayName,
          roles: parseRoles(user.roles || user.role)
        };
        saveJson(STORAGE_KEYS.STAFF_SESSION, state.staffUser);

        try {
          const presets = await fetchTenantPresets({
            hospcode: state.tenantSession.hospcode,
            licenseKey: state.tenantSession.license_key,
            cloudBaseUrl: state.tenantSession.cloud_base_url
          });
          state.presets = presets;
          saveJson(STORAGE_KEYS.PRESETS_CACHE, presets);
        } catch (_) {}

        renderApp();
      } catch (err) {
        errBox.textContent = err.message || 'ไม่สามารถเข้าสู่ระบบเจ้าหน้าที่ได้';
        errBox.style.display = 'block';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'เข้าสู่หน้าโต๊ะตรวจทันที';
        }
      }
    });
    return;
  }

  document.getElementById('btnStaffLogout').addEventListener('click', () => {
    state.staffUser = null;
    saveJson(STORAGE_KEYS.STAFF_SESSION, null);
    renderApp();
  });

  document.getElementById('btnRefreshQueue').addEventListener('click', loadTodayQueue);
  document.getElementById('btnNewVisitMode').addEventListener('click', resetStaffVisitForm);
  document.getElementById('queueFilterInput').addEventListener('input', renderQueueList);

  // Switch Tabs
  document.querySelectorAll('#staffTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('#staffTabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.staff-tab-panel').forEach((p) => {
        p.style.display = p.getAttribute('data-panel') === tab ? 'block' : 'none';
      });
      if (tab === 'history' && state.currentPatient?.cid) {
        loadPatientHistory(state.currentPatient.cid);
      }
    });
  });

  // Preset Chips
  document.querySelectorAll('.chip[data-fill-target]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const targetId = chip.getAttribute('data-fill-target');
      const text = chip.getAttribute('data-fill-text') || '';
      const el = document.getElementById(targetId);
      if (el && text) {
        el.value = el.value ? `${el.value}, ${text}` : text;
      }
    });
  });

  // Lookup Patient & Smart Card
  document.getElementById('btnStaffSearchCid').addEventListener('click', () => {
    const cid = document.getElementById('staffCidInput').value.replace(/\D/g, '').trim();
    lookupPatientForStaff(cid);
  });

  document.getElementById('btnStaffReadCard').addEventListener('click', async () => {
    try {
      const card = await readSmartCardBridge();
      const cid = String(card.cid || card.idcard || '').replace(/\D/g, '').trim();
      if (cid) {
        document.getElementById('staffCidInput').value = cid;
        await lookupPatientForStaff(cid);
      }
    } catch (err) {
      showStaffBanner('alert-amber', `อ่านบัตรไม่ได้: ${err.message}`);
    }
  });

  // Re Med
  document.getElementById('btnReMed').addEventListener('click', async () => {
    const cid = String(state.currentPatient?.cid || document.getElementById('staffCidInput').value || '').replace(/\D/g, '').trim();
    if (!cid) return showStaffBanner('alert-amber', 'กรุณาเลือกหรือค้นหาผู้ป่วยก่อน');
    try {
      const res = await fetchReMed(state.tenantSession, cid);
      renderAllergyWarning(res.allergies || []);
      if (Array.isArray(res.diags) && res.diags.length) {
        state.selectedIcds = res.diags.map((d) => ({
          diagcode: d.diagcode,
          dxtype: d.dxtype || '01',
          conti: '',
          appointDate: ''
        }));
        renderSelectedIcds();
      }
      if (Array.isArray(res.drugs) && res.drugs.length) {
        state.selectedDrugs = res.drugs.map((dr) => ({
          drugcode: dr.drugcode,
          drugname: dr.drugname,
          unit: Number(dr.unit) || 1,
          costprice: Number(dr.costprice) || 0,
          realprice: Number(dr.realprice) || 0,
          dose: dr.dose || ''
        }));
        renderSelectedDrugs();
      }
      if (res.diagnote) {
        document.getElementById('stDiagNote').value = res.diagnote;
      }
      document.getElementById('reMedInfo').textContent = res.lastVisitDate
        ? `ดึงข้อมูลจาก Visit วันที่ ${String(res.lastVisitDate).slice(0, 10)}`
        : 'ไม่พบประวัติการจ่ายยาก่อนหน้า';
    } catch (err) {
      showStaffBanner('alert-red', err.message);
    }
  });

  // ICD-10 Search
  document.getElementById('btnSearchIcd').addEventListener('click', doSearchIcd);
  document.getElementById('icdSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearchIcd(); }
  });

  // Drug Search
  document.getElementById('btnSearchDrug').addEventListener('click', doSearchDrug);
  document.getElementById('drugSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearchDrug(); }
  });

  // AI & Jitsi
  document.getElementById('btnRunStaffAi').addEventListener('click', async () => {
    const box = document.getElementById('staffAiResult');
    box.style.display = 'block';
    box.className = 'alert-banner alert-amber';
    box.textContent = 'กำลังวิเคราะห์ด้วย AI...';
    try {
      const res = await analyzeAiVitals(state.tenantSession, {
        sysDia: document.getElementById('stPressure').value.trim(),
        sugar: document.getElementById('stSugar').value.trim(),
        weight: document.getElementById('stWeight').value.trim()
      });
      const colorMap = { red: 'alert-red', yellow: 'alert-amber', green: 'alert-green' };
      box.className = `alert-banner ${colorMap[res.triageColor] || 'alert-green'}`;
      box.textContent = res.message;
    } catch (err) {
      box.className = 'alert-banner alert-red';
      box.textContent = err.message;
    }
  });

  document.getElementById('btnOpenJitsi').addEventListener('click', () => {
    const room = encodeURIComponent(document.getElementById('jitsiRoomInput').value.trim() || 'mini-health-room');
    document.getElementById('jitsiContainer').innerHTML = `
      <iframe src="https://meet.jit.si/${room}" allow="camera; microphone; fullscreen; display-capture"
        style="width:100%;height:340px;border:1px solid var(--border);border-radius:10px;"></iframe>
    `;
  });

  // Save Queue
  document.getElementById('btnSaveStaffQueue').addEventListener('click', handleSaveStaffQueue);

  loadTodayQueue();
}

async function loadTodayQueue() {
  try {
    const res = await fetchTodayQueue(state.tenantSession);
    state.todayQueue = Array.isArray(res.data) ? res.data : [];
    renderQueueList();
  } catch (err) {
    const listEl = document.getElementById('todayQueueList');
    if (listEl) listEl.innerHTML = `<div class="alert-banner alert-red">${esc(err.message)}</div>`;
  }
}

function renderQueueList() {
  const listEl = document.getElementById('todayQueueList');
  const badgeEl = document.getElementById('queueCountBadge');
  const filterVal = (document.getElementById('queueFilterInput')?.value || '').trim().toLowerCase();
  if (!listEl) return;

  const filtered = state.todayQueue.filter((item) => {
    if (!filterVal) return true;
    return `${item.fname || ''} ${item.lname || ''} ${item.cid || ''} ${item.visitno || ''}`.toLowerCase().includes(filterVal);
  });

  if (badgeEl) badgeEl.textContent = String(filtered.length);

  if (!filtered.length) {
    listEl.innerHTML = `<div class="muted">ไม่มีคิวตรวจวันนี้</div>`;
    return;
  }

  listEl.innerHTML = filtered.map((item) => {
    const done = Number(item.diag_count || 0) > 0 || Number(item.drug_count || 0) > 0;
    const isActive = Number(state.currentVisitno) === Number(item.visitno);
    return `
      <button type="button" class="queue-item ${isActive ? 'active' : ''}" data-select-visitno="${item.visitno}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>#${item.visitno} ${esc(item.fname || '')} ${esc(item.lname || '')}</strong>
          <span class="pill ${done ? 'pill-online' : 'pill-warn'}">${done ? 'ตรวจแล้ว' : 'รอตรวจ'}</span>
        </div>
        <div class="muted" style="margin-top:4px;">BP: ${esc(item.pressure || '-')} | โรค ${item.diag_count || 0} | ยา ${item.drug_count || 0}</div>
      </button>
    `;
  }).join('');

  listEl.querySelectorAll('[data-select-visitno]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const vno = Number(btn.getAttribute('data-select-visitno'));
      selectExistingVisit(vno);
    });
  });
}

async function selectExistingVisit(visitno) {
  try {
    const res = await fetchVisitDetail(state.tenantSession, visitno);
    const v = res.visit || {};
    state.currentVisitno = v.visitno;
    state.currentPatient = {
      cid: v.cid,
      fname: v.fname,
      lname: v.lname,
      age_months: v.age_months
    };
    document.getElementById('staffCidInput').value = v.cid || '';
    document.getElementById('visitModeBadge').textContent = `โหมด: แก้ไข Visit #${v.visitno}`;
    document.getElementById('stSymptoms').value = v.symptoms || '';
    document.getElementById('stSymptomsco').value = v.symptomsco || '';
    document.getElementById('stWeight').value = v.weight || '';
    document.getElementById('stHeight').value = v.height || '';
    document.getElementById('stPressure').value = v.pressure || '';
    document.getElementById('stPulse').value = v.pulse || '';
    document.getElementById('stTemp').value = v.temperature || '';
    document.getElementById('stWaist').value = v.waist || '';
    document.getElementById('stDiagNote').value = v.diagnote || '';
    document.getElementById('stTimeService').value = String(v.timeservice || '1');
    if (v.age_months !== undefined && v.age_months !== null) {
      document.getElementById('stAgeMonths').value = v.age_months;
    }

    state.selectedIcds = (res.diags || []).map((d) => ({
      diagcode: d.diagcode,
      dxtype: d.dxtype || '01',
      conti: '',
      appointDate: ''
    }));
    state.selectedDrugs = (res.drugs || []).map((dr) => ({
      drugcode: dr.drugcode,
      drugname: dr.drugname,
      unit: Number(dr.unit) || 1,
      costprice: Number(dr.costprice) || 0,
      realprice: Number(dr.realprice) || 0,
      dose: dr.dose || ''
    }));

    renderPatientSummary(state.currentPatient, '');
    renderAllergyWarning(res.allergies || []);
    renderSelectedIcds();
    renderSelectedDrugs();
    renderQueueList();
  } catch (err) {
    showStaffBanner('alert-red', err.message);
  }
}

function resetStaffVisitForm() {
  state.currentVisitno = null;
  state.currentPatient = null;
  state.selectedIcds = [];
  state.selectedDrugs = [];
  document.getElementById('visitModeBadge').textContent = 'โหมด: สร้าง Visit ใหม่';
  ['staffCidInput', 'stSymptoms', 'stSymptomsco', 'stWeight', 'stHeight', 'stPressure', 'stPulse', 'stTemp', 'stWaist', 'stDiagNote', 'stSugar', 'stSugarFasting', 'stAgeMonths', 'stHeadCircum'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('patientSummaryBar').style.display = 'none';
  document.getElementById('allergyWarningBar').style.display = 'none';
  renderSelectedIcds();
  renderSelectedDrugs();
  renderQueueList();
}

async function lookupPatientForStaff(cid) {
  if (!/^\d{13}$/.test(cid)) {
    return showStaffBanner('alert-amber', 'กรุณากรอกเลขบัตรประชาชน 13 หลัก');
  }
  try {
    const res = await fetchPatientByCid(state.tenantSession, cid);
    const p = res.data || {};
    state.currentPatient = { cid, ...p };
    if (p.age_months !== undefined && p.age_months !== null) {
      document.getElementById('stAgeMonths').value = p.age_months;
    }
    renderPatientSummary(state.currentPatient, p.chronic);
  } catch (err) {
    showStaffBanner('alert-red', err.message);
  }
}

function renderPatientSummary(p, chronic) {
  const bar = document.getElementById('patientSummaryBar');
  if (!bar || !p) return;
  bar.style.display = 'block';
  bar.textContent = `ผู้ป่วย: ${p.fname || ''} ${p.lname || ''} (CID: ${p.cid || '-'}) | อายุ: ${p.age_months ?? '-'} เดือน | โรคประจำตัว: ${chronic || p.chronic || '-'}`;
}

function renderAllergyWarning(allergies) {
  const bar = document.getElementById('allergyWarningBar');
  if (!bar) return;
  if (!allergies.length) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  bar.textContent = `แจ้งเตือนประวัติแพ้ยา (personalergic): ${allergies.map((a) => a.drugname || a.drugcode).join(', ')}`;
}

async function doSearchIcd() {
  const q = document.getElementById('icdSearchInput').value.trim();
  const box = document.getElementById('icdSearchResults');
  try {
    const res = await searchIcd10(state.tenantSession, q);
    const rows = res.data || [];
    box.innerHTML = rows.length
      ? rows.map((r) => `<div style="padding:4px 0;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;">
          <span><strong>${esc(r.diseasecode)}</strong> - ${esc(r.diseasenamethai || r.diseasename || '')}</span>
          <button type="button" class="btn btn-outline btn-sm" data-add-icd="${escAttr(r.diseasecode)}">+ เลือก</button>
        </div>`).join('')
      : '<div class="muted">ไม่พบรหัสโรค</div>';
    box.querySelectorAll('[data-add-icd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-add-icd');
        if (!state.selectedIcds.some((x) => x.diagcode === code)) {
          state.selectedIcds.push({ diagcode: code, dxtype: '01', conti: '', appointDate: '' });
          renderSelectedIcds();
        }
      });
    });
  } catch (err) {
    box.innerHTML = `<div class="muted">${esc(err.message)}</div>`;
  }
}

function renderSelectedIcds() {
  const tbody = document.getElementById('selectedIcdBody');
  if (!tbody) return;
  if (!state.selectedIcds.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">ยังไม่ได้เลือกรหัส ICD-10</td></tr>';
    return;
  }
  tbody.innerHTML = state.selectedIcds.map((item, idx) => `
    <tr>
      <td><strong>${esc(item.diagcode)}</strong></td>
      <td>
        <select data-icd-dxtype="${idx}">
          <option value="01" ${item.dxtype === '01' ? 'selected' : ''}>01 Principal</option>
          <option value="02" ${item.dxtype === '02' ? 'selected' : ''}>02 Co-morbidity</option>
          <option value="03" ${item.dxtype === '03' ? 'selected' : ''}>03 Complication</option>
        </select>
      </td>
      <td><input type="date" data-icd-appo="${idx}" value="${escAttr(item.appointDate || '')}" /></td>
      <td><button type="button" class="btn btn-danger btn-sm" data-del-icd="${idx}">x</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-icd-dxtype]').forEach((sel) => {
    sel.addEventListener('change', () => {
      state.selectedIcds[Number(sel.getAttribute('data-icd-dxtype'))].dxtype = sel.value;
    });
  });
  tbody.querySelectorAll('[data-icd-appo]').forEach((inp) => {
    inp.addEventListener('change', () => {
      state.selectedIcds[Number(inp.getAttribute('data-icd-appo'))].appointDate = inp.value;
    });
  });
  tbody.querySelectorAll('[data-del-icd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedIcds.splice(Number(btn.getAttribute('data-del-icd')), 1);
      renderSelectedIcds();
    });
  });
}

async function doSearchDrug() {
  const q = document.getElementById('drugSearchInput').value.trim();
  const cat = document.getElementById('drugCategorySelect').value;
  const box = document.getElementById('drugSearchResults');
  try {
    const res = await searchDrug(state.tenantSession, q, cat);
    const rows = Array.isArray(res.data) ? res.data : [];
    state.lastDrugSearchResults = rows;
    box.innerHTML = rows.length
      ? rows.map((r, idx) => `<div style="padding:4px 0;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;">
          <span><strong>${esc(r.drugname)}</strong> <span class="muted">(${esc(r.drugcode)} | type:${esc(r.drugtype)})</span></span>
          <button type="button" class="btn btn-outline btn-sm" data-add-drug-idx="${idx}">+ สั่ง</button>
        </div>`).join('')
      : '<div class="muted">ไม่พบรายการ</div>';

    box.querySelectorAll('[data-add-drug-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-add-drug-idx'));
        const r = state.lastDrugSearchResults[idx];
        if (!r) return;
        state.selectedDrugs.push({
          drugcode: r.drugcode,
          drugname: r.drugname,
          unit: 1,
          costprice: Number(r.costprice) || 0,
          realprice: Number(r.realprice) || 0,
          dose: ''
        });
        renderSelectedDrugs();
      });
    });
  } catch (err) {
    box.innerHTML = `<div class="muted">${esc(err.message)}</div>`;
  }
}

function renderSelectedDrugs() {
  const tbody = document.getElementById('selectedDrugBody');
  if (!tbody) return;
  if (!state.selectedDrugs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">ยังไม่มีรายการยา/สมุนไพร/หัตถการ</td></tr>';
    return;
  }
  tbody.innerHTML = state.selectedDrugs.map((dr, idx) => `
    <tr>
      <td><strong>${esc(dr.drugname)}</strong><div class="muted">${esc(dr.drugcode)}</div></td>
      <td>
        <div class="stepper">
          <button type="button" data-drug-step="${idx}" data-delta="-1">-</button>
          <span>${dr.unit}</span>
          <button type="button" data-drug-step="${idx}" data-delta="1">+</button>
        </div>
      </td>
      <td><input type="text" list="dosePresetsList" data-drug-dose="${idx}" value="${escAttr(dr.dose || '')}" placeholder="วิธีใช้ / คำแนะนำ" /></td>
      <td><button type="button" class="btn btn-danger btn-sm" data-del-drug="${idx}">x</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-drug-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-drug-step'));
      const delta = Number(btn.getAttribute('data-delta'));
      const nextUnit = Math.max(1, (Number(state.selectedDrugs[idx].unit) || 1) + delta);
      state.selectedDrugs[idx].unit = nextUnit;
      renderSelectedDrugs();
    });
  });

  tbody.querySelectorAll('[data-drug-dose]').forEach((inp) => {
    inp.addEventListener('input', () => {
      state.selectedDrugs[Number(inp.getAttribute('data-drug-dose'))].dose = inp.value;
    });
  });

  tbody.querySelectorAll('[data-del-drug]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedDrugs.splice(Number(btn.getAttribute('data-del-drug')), 1);
      renderSelectedDrugs();
    });
  });
}

async function loadPatientHistory(cid) {
  const box = document.getElementById('patientHistoryBox');
  if (!box) return;
  box.innerHTML = 'กำลังโหลดประวัติย้อนหลัง...';
  try {
    const res = await fetchPatientHistory(state.tenantSession, cid);
    const visits = res.data || [];
    if (!visits.length) {
      box.innerHTML = '<div class="muted">ไม่พบประวัติการรับบริการย้อนหลัง</div>';
      return;
    }
    box.innerHTML = visits.map((v) => `
      <div class="card" style="padding:10px;margin-bottom:8px;">
        <strong>วันที่ ${esc(String(v.visitdate || '').slice(0, 10))} (Visit #${v.visitno})</strong>
        <div class="muted">BP: ${esc(v.pressure || '-')} | CC: ${esc(v.symptoms || '-')}</div>
        <div class="muted">ICD-10: ${(v.diags || []).map((d) => d.diagcode).join(', ') || '-'} | ยา: ${(v.drugs || []).map((d) => `${d.drugname} (${d.unit})`).join(', ') || '-'}</div>
      </div>
    `).join('');
  } catch (err) {
    box.innerHTML = `<div class="alert-banner alert-red">${esc(err.message)}</div>`;
  }
}

async function handleSaveStaffQueue() {
  const cid = document.getElementById('staffCidInput').value.replace(/\D/g, '').trim();
  if (!/^\d{13}$/.test(cid)) {
    return showStaffBanner('alert-amber', 'กรุณาระบุเลขบัตรประชาชนผู้ป่วย 13 หลัก');
  }

  const ageMonthsRaw = document.getElementById('stAgeMonths').value;
  const payload = {
    cid,
    visitno: state.currentVisitno || undefined,
    isStaff: true,
    serviceType: 'staff_custom',
    customSymptoms: document.getElementById('stSymptoms').value.trim(),
    customSymptomsco: document.getElementById('stSymptomsco').value.trim(),
    weight: document.getElementById('stWeight').value,
    height: document.getElementById('stHeight').value,
    sysDia: document.getElementById('stPressure').value.trim(),
    pulse: document.getElementById('stPulse').value,
    temp: document.getElementById('stTemp').value,
    waist: document.getElementById('stWaist').value,
    timeService: document.getElementById('stTimeService').value,
    diagNote: document.getElementById('stDiagNote').value.trim(),
    sugar: document.getElementById('stSugar').value,
    sugarFastingStatus: document.getElementById('stSugarFasting').value.trim(),
    ageMonths: ageMonthsRaw !== '' ? Number(ageMonthsRaw) : undefined,
    headCircum: document.getElementById('stHeadCircum').value,
    nlevel: document.getElementById('stNlevel').value,
    nlevel2: document.getElementById('stNlevel2').value,
    nlevel3: document.getElementById('stNlevel3').value,
    smokeStatus: document.getElementById('stSmokeStatus').value,
    alcoholStatus: document.getElementById('stAlcoholStatus').value,
    icd10List: state.selectedIcds,
    drugList: state.selectedDrugs
  };

  try {
    const res = await saveQueueVisit(state.tenantSession, payload);
    state.currentVisitno = res.visitno;
    document.getElementById('visitModeBadge').textContent = `โหมด: แก้ไข Visit #${res.visitno}`;
    showStaffBanner('alert-green', `บันทึกเข้า JHCIS สำเร็จ (Visit #${res.visitno})`);
    await loadTodayQueue();
  } catch (err) {
    showStaffBanner('alert-red', `บันทึกไม่สำเร็จ: ${err.message}`);
  }
}

function showStaffBanner(cls, msg) {
  const el = document.getElementById('staffAlertBanner');
  if (!el) return;
  el.style.display = 'block';
  el.className = `alert-banner ${cls}`;
  el.textContent = msg;
}

// ==============================================================================
// 3. VHV KIOSK MODE
// ==============================================================================
function renderVhvBody() {
  if (!state.vhvUser) {
    return `
      <div class="card" style="max-width:460px;margin:20px auto;">
        <h2 class="card-title">เข้าสู่ระบบ อสม. (Kiosk)</h2>
        <p class="muted">กรอกเลขบัตรประชาชน อสม. เพื่อเริ่มคัดกรองประชาชนและบันทึกคิวเข้า JHCIS</p>
        <form id="vhvLoginForm">
          <div class="field">
            <label for="vhvLoginCid">เลขบัตรประชาชน อสม. (13 หลัก)</label>
            <input type="text" id="vhvLoginCid" maxlength="13" required placeholder="กรอกเลขบัตร 13 หลัก" />
          </div>
          <div id="vhvLoginError" class="alert-banner alert-red" style="display:none;"></div>
          <button type="submit" class="btn btn-primary" style="width:100%;" id="vhvLoginSubmitBtn">เข้าสู่โหมด อสม.</button>
        </form>
      </div>
    `;
  }
  return renderVhvKioskView({
    vhvUser: state.vhvUser,
    offlineCount: getOfflineQueue().length
  });
}

function bindVhvEvents() {
  if (!state.vhvUser) {
    const form = document.getElementById('vhvLoginForm');
    const errBox = document.getElementById('vhvLoginError');
    const submitBtn = document.getElementById('vhvLoginSubmitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      const cid = document.getElementById('vhvLoginCid').value.replace(/\D/g, '').trim();
      if (cid.length !== 13) {
        errBox.textContent = 'กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก';
        errBox.style.display = 'block';
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังตรวจสอบสิทธิ์...';
      }

      try {
        const user = await tenantUserLogin({
          hospcode: state.tenantSession.hospcode,
          licenseKey: state.tenantSession.license_key,
          cid,
          cloudBaseUrl: state.tenantSession.cloud_base_url
        });

        if ((user.role || user.roles) && !hasAnyRole(user, ['vhv', 'staff', 'tenant_admin'])) {
          throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานโหมด อสม.');
        }

        const displayName = user.full_name || user.name || user.fullname || `อสม. ${cid}`;
        state.vhvUser = {
          ...user,
          cid: user.cid || cid,
          name: displayName,
          full_name: displayName,
          roles: parseRoles(user.roles || user.role)
        };
        saveJson(STORAGE_KEYS.VHV_SESSION, state.vhvUser);
        renderApp();
      } catch (cloudErr) {
        try {
          const res = await vhvLoginByCid(state.tenantSession, cid);
          const info = res.data || {};
          const displayName = info.full_name || info.name || `อสม. ${cid}`;
          state.vhvUser = { cid: info.cid || cid, name: displayName, full_name: displayName };
          saveJson(STORAGE_KEYS.VHV_SESSION, state.vhvUser);
          renderApp();
        } catch (_) {
          errBox.textContent = cloudErr.message || 'ไม่พบข้อมูล อสม. ในระบบ';
          errBox.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'เข้าสู่โหมด อสม.';
        }
      }
    });
    return;
  }

  // Heartbeat ทุก 5 วินาทีเพื่อให้สถานะ Online Real-time ไม่หลุด
  sendVhvHeartbeat(state.tenantSession, { cid: state.vhvUser.cid, status: 'online' });
  stopVhvHeartbeat();
  state.vhvHeartbeatTimer = setInterval(() => {
    if (state.vhvUser && state.tenantSession) {
      sendVhvHeartbeat(state.tenantSession, { cid: state.vhvUser.cid, status: 'online' });
    }
  }, 5000);

  document.getElementById('btnVhvLogout').addEventListener('click', () => {
    stopVhvHeartbeat();
    sendVhvHeartbeat(state.tenantSession, { cid: state.vhvUser.cid, status: 'offline' });
    state.vhvUser = null;
    saveJson(STORAGE_KEYS.VHV_SESSION, null);
    renderApp();
  });

  document.getElementById('btnSyncOfflineNow').addEventListener('click', async () => {
    const r = await flushOfflineQueue(state.tenantSession);
    updateOfflinePill();
    showKioskAlert('alert-green', `ซิงก์สำเร็จ ${r.synced} รายการ | คงค้าง ${r.remaining} รายการ`);
  });

  document.getElementById('btnKioskLookup').addEventListener('click', async () => {
    const cid = document.getElementById('kioskCid').value.replace(/\D/g, '').trim();
    if (!/^\d{13}$/.test(cid)) return showKioskAlert('alert-amber', 'กรอกเลขบัตรประชาชน 13 หลัก');
    try {
      const res = await fetchPatientByCid(state.tenantSession, cid);
      const d = res.data || {};
      const box = document.getElementById('kioskPatientCard');
      box.style.display = 'block';
      box.textContent = `พบผู้รับบริการ: ${d.fname || ''} ${d.lname || ''} | อายุ ${d.age_months ?? '-'} เดือน | โรคประจำตัว: ${d.chronic || '-'}`;
      if (d.age_months !== undefined && d.age_months !== null) {
        document.getElementById('kioskAgeMonths').value = d.age_months;
      }
    } catch (err) {
      showKioskAlert('alert-red', err.message);
    }
  });

  document.getElementById('btnKioskReadCard').addEventListener('click', async () => {
    try {
      const card = await readSmartCardBridge();
      const cid = String(card.cid || card.idcard || '').replace(/\D/g, '').trim();
      if (cid) {
        document.getElementById('kioskCid').value = cid;
        document.getElementById('btnKioskLookup').click();
      }
    } catch (err) {
      showKioskAlert('alert-amber', `อ่านบัตรไม่สำเร็จ: ${err.message}`);
    }
  });

  document.querySelectorAll('#ratingStars .star-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ratingScore = Number(btn.getAttribute('data-score'));
      document.querySelectorAll('#ratingStars .star-btn').forEach((b) => {
        b.classList.toggle('selected', Number(b.getAttribute('data-score')) === state.ratingScore);
      });
    });
  });

  document.getElementById('btnSubmitKiosk').addEventListener('click', async () => {
    const cid = document.getElementById('kioskCid').value.replace(/\D/g, '').trim();
    if (!/^\d{13}$/.test(cid)) return showKioskAlert('alert-amber', 'กรอกเลขบัตรประชาชน 13 หลัก');

    const serviceType = document.getElementById('kioskServiceType').value;
    const ageMonthsVal = document.getElementById('kioskAgeMonths').value;
    const queuePayload = {
      cid,
      vhv_cid: state.vhvUser.cid,
      serviceType,
      weight: document.getElementById('kioskWeight').value,
      height: document.getElementById('kioskHeight').value,
      sysDia: document.getElementById('kioskPressure').value.trim(),
      pulse: document.getElementById('kioskPulse').value,
      temp: document.getElementById('kioskTemp').value,
      waist: document.getElementById('kioskWaist').value,
      sugar: document.getElementById('kioskSugar').value,
      ageMonths: ageMonthsVal !== '' ? Number(ageMonthsVal) : undefined
    };

    try {
      const saved = await saveQueueVisit(state.tenantSession, queuePayload);
      try {
        await submitRating(state.tenantSession, { cid, visitno: saved.visitno, score: state.ratingScore });
      } catch (_) {}
      showKioskAlert('alert-green', `บันทึกข้อมูลเข้า JHCIS สำเร็จ (Visit #${saved.visitno}) และบันทึกคะแนน ${state.ratingScore} ดาวแล้ว`);
    } catch (_) {
      enqueueOfflineItem({ kind: 'queue', payload: queuePayload });
      const totalQueued = enqueueOfflineItem({ kind: 'rating', payload: { cid, visitno: null, score: state.ratingScore } });
      updateOfflinePill();
      showKioskAlert('alert-amber', `เน็ต/Connector ขัดข้อง — บันทึกลงคิวออฟไลน์แล้ว (รวมค้างส่ง ${totalQueued} รายการ)`);
    }
  });
}

function updateOfflinePill() {
  const pill = document.getElementById('kioskOfflinePill');
  if (!pill) return;
  const count = getOfflineQueue().length;
  pill.className = `pill ${count > 0 ? 'pill-warn' : 'pill-online'}`;
  pill.textContent = `คิวค้างส่ง: ${count} รายการ`;
}

function showKioskAlert(cls, msg) {
  const el = document.getElementById('kioskAlert');
  if (!el) return;
  el.style.display = 'block';
  el.className = `alert-banner ${cls}`;
  el.textContent = msg;
}

// ==============================================================================
// 4. TENANT ADMIN MODE (Multi-Role บุคลากร + Excel Bulk Import + Presets + อสม./BP/วิจัย)
// ==============================================================================
function renderAdminBody() {
  return renderTenantAdminView({
    tenantSession: state.tenantSession,
    adminPin: state.adminPin,
    offlineCount: getOfflineQueue().length
  });
}

function resetAdminUserForm() {
  ['newUserCid', 'newUserName', 'newUserPosition', 'newUserVillageNo', 'newUserPhone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('.new-user-role-cb').forEach((cb) => {
    cb.checked = cb.value === 'staff';
  });
}

function renderAdminUsersTable(users) {
  const tbody = document.getElementById('tenantUsersTableBody');
  if (!tbody) return;

  tbody.innerHTML = users.length
    ? users.map((u) => {
        const extraInfo = [
          u.position,
          u.village_no ? `ม.${u.village_no}` : '',
          u.phone
        ].filter(Boolean).join(' • ') || '-';

        return `<tr>
          <td>${esc(u.cid)}</td>
          <td>${esc(u.full_name || u.name || u.fullname || '-')}</td>
          <td>${formatRoleBadges(u.roles || u.role)}</td>
          <td>${esc(extraInfo)}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-outline btn-sm" data-edit-user="${escAttr(u.cid)}">แก้ไข</button>
            <button type="button" class="btn btn-danger btn-sm" data-del-user="${escAttr(u.cid)}">ลบ</button>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" class="muted">ยังไม่มีรายชื่อบุคลากร</td></tr>';

  tbody.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.getAttribute('data-edit-user');
      const target = state.adminUsersList.find((u) => String(u.cid) === String(cid));
      if (!target) return;
      document.getElementById('newUserCid').value = target.cid || '';
      document.getElementById('newUserName').value = target.full_name || target.name || '';
      document.getElementById('newUserPosition').value = target.position || '';
      document.getElementById('newUserVillageNo').value = target.village_no || '';
      document.getElementById('newUserPhone').value = target.phone || '';
      const targetRoles = parseRoles(target.roles || target.role);
      document.querySelectorAll('.new-user-role-cb').forEach((cb) => {
        cb.checked = targetRoles.includes(cb.value);
      });
      showAdminAlert('alert-amber', `กำลังแก้ไขข้อมูล ${target.full_name || target.name || cid} — ปรับบทบาทหรือรายละเอียดแล้วกด "บันทึกบุคลากร"`);
      document.getElementById('newUserName').focus();
    });
  });

  tbody.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = btn.getAttribute('data-del-user');
      setAdminPin(document.getElementById('adminPinInput')?.value || state.adminPin);
      if (!state.adminPin) return showAdminAlert('alert-amber', 'กรุณากรอก PIN Admin ก่อน');
      try {
        await deleteTenantUser({
          hospcode: state.tenantSession.hospcode,
          licenseKey: state.tenantSession.license_key,
          adminPin: state.adminPin,
          cid,
          cloudBaseUrl: state.tenantSession.cloud_base_url
        });
        showAdminAlert('alert-green', 'ลบบุคลากรเรียบร้อย');
        await loadAdminUsers();
      } catch (delErr) {
        showAdminAlert('alert-red', delErr.message);
      }
    });
  });
}

function renderAdminPresetsTable(presets) {
  const tbody = document.getElementById('tenantPresetsTableBody');
  if (!tbody) return;

  tbody.innerHTML = presets.length
    ? presets.map((p) => `<tr>
        <td>${esc(formatPresetCategory(p.category))}</td>
        <td>${esc(p.label || '')}</td>
        <td>${esc(p.content || p.text || '')}</td>
        <td><button type="button" class="btn btn-danger btn-sm" data-del-preset="${escAttr(p.id)}">ลบ</button></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="muted">ยังไม่มีข้อความสำเร็จรูป</td></tr>';

  tbody.querySelectorAll('[data-del-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-preset');
      setAdminPin(document.getElementById('adminPinInput')?.value || state.adminPin);
      if (!state.adminPin) return showAdminAlert('alert-amber', 'กรุณากรอก PIN Admin ก่อน');
      try {
        await deleteTenantPreset({
          hospcode: state.tenantSession.hospcode,
          licenseKey: state.tenantSession.license_key,
          adminPin: state.adminPin,
          id,
          cloudBaseUrl: state.tenantSession.cloud_base_url
        });
        showAdminAlert('alert-green', 'ลบข้อความสำเร็จรูปเรียบร้อย');
        await loadAdminPresets();
      } catch (delErr) {
        showAdminAlert('alert-red', delErr.message);
      }
    });
  });
}

function bindAdminEvents() {
  const pinInput = document.getElementById('adminPinInput');
  if (pinInput) {
    pinInput.addEventListener('input', () => setAdminPin(pinInput.value));
  }

  document.querySelectorAll('#adminTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-atab');
      document.querySelectorAll('#adminTabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.admin-tab-panel').forEach((p) => {
        p.style.display = p.getAttribute('data-apanel') === tab ? 'block' : 'none';
      });
    });
  });

  document.getElementById('btnLoadAdminData').addEventListener('click', async () => {
    setAdminPin(document.getElementById('adminPinInput').value);
    if (!state.adminPin) return showAdminAlert('alert-amber', 'กรุณากรอกรหัส PIN Admin ของหน่วยงาน');
    await Promise.all([loadAdminUsers(), loadAdminPresets()]);
  });

  document.getElementById('btnClearUserForm').addEventListener('click', resetAdminUserForm);

  document.getElementById('btnAddSingleUser').addEventListener('click', async () => {
    setAdminPin(document.getElementById('adminPinInput').value);
    if (!state.adminPin) return showAdminAlert('alert-amber', 'กรุณากรอก PIN Admin ก่อน');

    const cid = document.getElementById('newUserCid').value.replace(/\D/g, '').trim();
    const fullName = document.getElementById('newUserName').value.trim();
    const checkedRoles = parseRoles(
      Array.from(document.querySelectorAll('.new-user-role-cb:checked')).map((cb) => cb.value)
    );
    const position = document.getElementById('newUserPosition')?.value?.trim() || '';
    const villageNo = document.getElementById('newUserVillageNo')?.value?.trim() || '';
    const phone = document.getElementById('newUserPhone')?.value?.trim() || '';

    if (cid.length !== 13) {
      return showAdminAlert('alert-amber', 'กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก');
    }
    if (!fullName) {
      return showAdminAlert('alert-amber', 'กรุณากรอกชื่อ-สกุลบุคลากร');
    }
    if (!checkedRoles.length) {
      return showAdminAlert('alert-amber', 'กรุณาเลือกบทบาทอย่างน้อย 1 บทบาท');
    }

    try {
      await createTenantUser({
        hospcode: state.tenantSession.hospcode,
        licenseKey: state.tenantSession.license_key,
        adminPin: state.adminPin,
        user: {
          cid,
          name: fullName,
          full_name: fullName,
          role: checkedRoles.join(','),
          roles: checkedRoles,
          position,
          village_no: villageNo,
          phone
        },
        cloudBaseUrl: state.tenantSession.cloud_base_url
      });

      showAdminAlert('alert-green', 'บันทึกข้อมูลบุคลากรสำเร็จ');
      resetAdminUserForm();
      await loadAdminUsers();
    } catch (err) {
      showAdminAlert('alert-red', err.message);
    }
  });

  const fileInput = document.getElementById('excelUsersFile');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseUsersExcelFile(file);
      state.parsedExcelUsers = parsed.users;
      const box = document.getElementById('excelPreviewBox');
      box.innerHTML = `พร้อมนำเข้า <strong>${parsed.users.length}</strong> รายการ` +
        (parsed.errors.length ? `<div style="color:var(--red);">พบข้อผิดพลาด ${parsed.errors.length} แถว: ${esc(parsed.errors.join(' | '))}</div>` : '');
      document.getElementById('btnUploadExcelUsers').disabled = parsed.users.length === 0;
    } catch (err) {
      showAdminAlert('alert-red', `อ่านไฟล์ Excel ไม่สำเร็จ: ${err.message}`);
    }
  });

  document.getElementById('btnUploadExcelUsers').addEventListener('click', async () => {
    setAdminPin(document.getElementById('adminPinInput').value);
    if (!state.adminPin) return showAdminAlert('alert-amber', 'กรุณากรอก PIN Admin ก่อน');
    try {
      const normalizedUsers = (state.parsedExcelUsers || []).map(normalizeUserForApi);
      const r = await bulkImportTenantUsers({
        hospcode: state.tenantSession.hospcode,
        licenseKey: state.tenantSession.license_key,
        adminPin: state.adminPin,
        users: normalizedUsers,
        cloudBaseUrl: state.tenantSession.cloud_base_url
      });
      const count = r.imported ?? r.imported_count ?? normalizedUsers.length;
      showAdminAlert('alert-green', `นำเข้าบุคลากรสำเร็จ (${count} รายการ)`);
      state.parsedExcelUsers = [];
      fileInput.value = '';
      document.getElementById('excelPreviewBox').textContent = 'ยังไม่ได้เลือกไฟล์';
      document.getElementById('btnUploadExcelUsers').disabled = true;
      await loadAdminUsers();
    } catch (err) {
      showAdminAlert('alert-red', err.message);
    }
  });

  document.getElementById('btnAddPreset').addEventListener('click', async () => {
    setAdminPin(document.getElementById('adminPinInput').value);
    if (!state.adminPin) return showAdminAlert('alert-amber', 'กรุณากรอก PIN Admin ก่อน');
    const category = document.getElementById('newPresetCategory').value;
    const label = document.getElementById('newPresetLabel').value.trim();
    const content = document.getElementById('newPresetText').value.trim();
    if (!content) return showAdminAlert('alert-amber', 'กรุณากรอกข้อความสำเร็จรูป');
    try {
      await createTenantPreset({
        hospcode: state.tenantSession.hospcode,
        licenseKey: state.tenantSession.license_key,
        adminPin: state.adminPin,
        preset: { category, label: label || content.slice(0, 30), content, text: content },
        cloudBaseUrl: state.tenantSession.cloud_base_url
      });
      showAdminAlert('alert-green', 'เพิ่มข้อความสำเร็จรูปแล้ว');
      document.getElementById('newPresetLabel').value = '';
      document.getElementById('newPresetText').value = '';
      await loadAdminPresets();
    } catch (err) {
      showAdminAlert('alert-red', err.message);
    }
  });

  document.getElementById('btnRefreshAdminLive').addEventListener('click', async () => {
    await Promise.all([loadVhvStatsTable(), loadBpTable(), loadResearchBox()]);
  });

  document.getElementById('btnLoadBpMonitor').addEventListener('click', loadBpTable);

  document.getElementById('btnSwitchTenant').addEventListener('click', () => {
    stopVhvHeartbeat();
    setAdminPin('');
    state.tenantSession = null;
    state.staffUser = null;
    state.vhvUser = null;
    state.adminUsersList = [];
    saveJson(STORAGE_KEYS.TENANT_SESSION, null);
    saveJson(STORAGE_KEYS.STAFF_SESSION, null);
    saveJson(STORAGE_KEYS.VHV_SESSION, null);
    saveJson(STORAGE_KEYS.USERS_CACHE, null);
    renderApp();
  });

  // แสดงข้อมูลจากแคชทันทีเมื่อสลับกลับมาหน้า Admin และโหลดล่าสุดจากระบบกลางถ้ามี PIN แล้ว
  if (Array.isArray(state.adminUsersList) && state.adminUsersList.length) {
    renderAdminUsersTable(state.adminUsersList);
  }
  if (Array.isArray(state.presets) && state.presets.length) {
    renderAdminPresetsTable(state.presets);
  }
  if (state.adminPin) {
    loadAdminUsers();
    loadAdminPresets();
  }
}

async function loadAdminUsers() {
  try {
    const users = await listTenantUsers({
      hospcode: state.tenantSession.hospcode,
      licenseKey: state.tenantSession.license_key,
      adminPin: state.adminPin,
      cloudBaseUrl: state.tenantSession.cloud_base_url
    });
    state.adminUsersList = users;
    saveJson(STORAGE_KEYS.USERS_CACHE, users);
    renderAdminUsersTable(users);
  } catch (err) {
    showAdminAlert('alert-red', err.message);
  }
}

async function loadAdminPresets() {
  try {
    const presets = await fetchTenantPresets({
      hospcode: state.tenantSession.hospcode,
      licenseKey: state.tenantSession.license_key,
      cloudBaseUrl: state.tenantSession.cloud_base_url
    });
    state.presets = presets;
    saveJson(STORAGE_KEYS.PRESETS_CACHE, presets);
    renderAdminPresetsTable(presets);
  } catch (err) {
    showAdminAlert('alert-red', err.message);
  }
}

async function loadVhvStatsTable() {
  const tbody = document.getElementById('vhvStatsBody');
  if (!tbody) return;
  try {
    const res = await fetchVhvStats(state.tenantSession);
    const rows = res.data || [];
    tbody.innerHTML = rows.length
      ? rows.map((r) => `<tr>
          <td>${esc(r.vhv_name || r.vhv_cid)}</td>
          <td><span class="pill ${Number(r.is_online) === 1 ? 'pill-online' : 'pill-offline'}">${Number(r.is_online) === 1 ? 'Online' : 'Offline'}</span></td>
          <td>${r.total_patients ?? 0}</td>
          <td>${r.bp_recorded ?? 0}</td>
          <td>${r.sugar_recorded ?? 0}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="muted">ไม่มีข้อมูล อสม.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(err.message)}</td></tr>`;
  }
}

async function loadBpTable() {
  const tbody = document.getElementById('bpMonitorBody');
  const dateStr = document.getElementById('bpMonitorDate')?.value || new Date().toISOString().slice(0, 10);
  if (!tbody) return;
  try {
    const res = await fetchBpMonitor(state.tenantSession, dateStr);
    const rows = res.data || [];
    tbody.innerHTML = rows.length
      ? rows.map((r) => `<tr>
          <td>${esc(r.patient_name || r.patient_cid)}</td>
          <td><strong>${esc(r.sys_dia)}</strong></td>
          <td><span class="pill pill-warn">${esc(r.levelName || '')}</span></td>
          <td>
            <input type="text" data-bp-note-input="${r.log_id}" value="${escAttr(r.follow_up_note || '')}" placeholder="บันทึกติดตาม..." style="width:130px;display:inline-block;" />
            <button type="button" class="btn btn-outline btn-sm" data-bp-save="${r.log_id}">บันทึก</button>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="muted">ไม่พบเคสความดันสูงในวันที่เลือก</td></tr>';

    tbody.querySelectorAll('[data-bp-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const logId = btn.getAttribute('data-bp-save');
        const note = tbody.querySelector(`[data-bp-note-input="${logId}"]`)?.value || '';
        try {
          await saveBpFollowup(state.tenantSession, { log_id: logId, note });
          showAdminAlert('alert-green', 'บันทึกการติดตามความดันเรียบร้อย');
        } catch (saveErr) {
          showAdminAlert('alert-red', saveErr.message);
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">${esc(err.message)}</td></tr>`;
  }
}

async function loadResearchBox() {
  const sumBox = document.getElementById('researchSummaryBox');
  const grid = document.getElementById('researchCardsGrid');
  if (!sumBox || !grid) return;
  try {
    const res = await fetchResearchAnalytics(state.tenantSession);
    const d = res.data || {};
    sumBox.className = 'alert-banner alert-green';
    sumBox.textContent = d.summary || 'โหลดสถิติสำเร็จ';
    grid.innerHTML = `
      <div class="card" style="padding:12px;"><div class="muted">ผู้ใช้งานทั้งหมด</div><strong style="font-size:20px;">${d.usage?.total ?? 0}</strong></div>
      <div class="card" style="padding:12px;"><div class="muted">ชาย / หญิง</div><strong style="font-size:18px;">${d.usage?.male ?? 0} / ${d.usage?.female ?? 0}</strong></div>
      <div class="card" style="padding:12px;"><div class="muted">คะแนนพึงพอใจเฉลี่ย</div><strong style="font-size:20px;">${d.satisfaction?.average ?? 0} / 5</strong></div>
      <div class="card" style="padding:12px;"><div class="muted">ผู้สูงอายุ 60+ ปี</div><strong style="font-size:20px;">${d.ageGroups?.gen4 ?? 0}</strong></div>
    `;
  } catch (err) {
    sumBox.className = 'alert-banner alert-red';
    sumBox.textContent = err.message;
  }
}

function showAdminAlert(cls, msg) {
  const el = document.getElementById('adminAlert');
  if (!el) return;
  el.style.display = 'block';
  el.className = `alert-banner ${cls}`;
  el.textContent = msg;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

// ส่งสถานะ offline ของ อสม. ก่อนปิดแท็บ/หน้าเว็บ
window.addEventListener('beforeunload', () => {
  if (state.vhvUser && state.tenantSession) {
    sendVhvHeartbeat(state.tenantSession, { cid: state.vhvUser.cid, status: 'offline' });
  }
});

// ปิด Service Worker ตอนพัฒนาบน localhost เพื่อไม่ให้แคชโค้ดเก่าค้าง
if ('serviceWorker' in navigator) {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

renderApp();
refreshConnectorStatus();

initSuperFeatures();
