#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mini Health Station SaaS — Phase 3: Central Web App (Multi-Tenant PWA) Generator
วางไฟล์นี้ไว้ในโฟลเดอร์ mini-health-saas/web-app/ แล้วรัน:
    python setup_phase3.py
สคริปต์จะสร้างโครงสร้างเว็บแอป Multi-Tenant PWA ครบทั้ง 3 โหมด
(โหมดเจ้าหน้าที่ StaffClinicalWorkspace, โหมด อสม. Kiosk, โหมด Admin ประจำหน่วยงาน)
รองรับ Multi-Role (1 คนหลายบทบาท), PWA Manifest, Service Worker, Excel Bulk Import Parser
และเชื่อมต่อ Central Cloud (เฟส 1) + Local Connector (เฟส 2) ครบถ้วน
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

FILES = {}

# ==============================================================================
# 1. package.json
# ==============================================================================
FILES["package.json"] = """{
  "name": "mini-health-web-app",
  "version": "3.1.0",
  "private": true,
  "description": "Mini Health Station SaaS - Phase 3: Central Web App (Multi-Tenant PWA)",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173"
  },
  "dependencies": {
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "vite": "^6.0.7"
  }
}
"""

# ==============================================================================
# 2. vite.config.js
# ==============================================================================
FILES["vite.config.js"] = """import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
"""

# ==============================================================================
# 3. index.html
# ==============================================================================
FILES["index.html"] = """<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#0f766e" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Mini Health PWA" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
  <title>Mini Health Station SaaS — Multi-Tenant PWA</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
"""

# ==============================================================================
# 4. public/manifest.webmanifest & public/sw.js & public/icons/icon-192.svg
# ==============================================================================
FILES["public/manifest.webmanifest"] = """{
  "name": "Mini Health Station SaaS (Multi-Tenant PWA)",
  "short_name": "Mini Health PWA",
  "description": "ระบบบริการปฐมภูมิ คัดกรอง อสม. และโต๊ะตรวจเจ้าหน้าที่ เชื่อมต่อ JHCIS ผ่าน Local Connector",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f1f5f9",
  "theme_color": "#0f766e",
  "orientation": "any",
  "icons": [
    {
      "src": "/icons/icon-192.svg",
      "sizes": "192x192",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
"""

FILES["public/icons/icon-192.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <rect width="192" height="192" rx="40" fill="url(#g)"/>
  <rect x="82" y="46" width="28" height="100" rx="8" fill="#ffffff"/>
  <rect x="46" y="82" width="100" height="28" rx="8" fill="#ffffff"/>
  <circle cx="144" cy="144" r="18" fill="#2dd4bf"/>
</svg>
"""

FILES["public/sw.js"] = r"""const CACHE_NAME = 'mini-health-pwa-v3.1.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ไม่แคชคำขอเรียก API ของ Central Cloud หรือ Local Connector
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/jhcis-api/') ||
    url.hostname.includes('workers.dev')
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
"""

# ==============================================================================
# 5. src/config/constants.js
# ==============================================================================
FILES["src/config/constants.js"] = """export const CLOUD_BASE_URL = 'https://mini-health-saas-cloud.sirapop-nick.workers.dev';
export const CARD_BRIDGE_URL = 'http://localhost:8189';
export const VALID_ROLES = ['staff', 'vhv', 'tenant_admin'];
export const STORAGE_KEYS = {
  TENANT_SESSION: 'mhs_tenant_session_v3',
  STAFF_SESSION: 'mhs_staff_session_v3',
  VHV_SESSION: 'mhs_vhv_session_v3',
  OFFLINE_QUEUE: 'mhs_offline_queue_v3',
  PRESETS_CACHE: 'mhs_presets_cache_v3',
  USERS_CACHE: 'mhs_users_cache_v3',
  ACTIVE_MODE: 'mhs_active_mode_v3'
};
"""

# ==============================================================================
# 6. src/services/cloudApi.js
# ==============================================================================
FILES["src/services/cloudApi.js"] = r"""import { CLOUD_BASE_URL, VALID_ROLES } from '../config/constants.js';

function buildTenantHeaders(hospcode, licenseKey, extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-hospcode': String(hospcode || '').trim(),
    'x-license-key': String(licenseKey || '').trim(),
    ...extra
  };
}

async function parseJsonSafe(res) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : {};
  } catch (_) {
    return { success: false, message: txt || `HTTP ${res.status}` };
  }
}

function normalizeRoleList(roleInput, fallback = ['vhv']) {
  const rawList = Array.isArray(roleInput)
    ? roleInput
    : String(roleInput || '').split(/[,|/;]+/);

  const normalized = Array.from(
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
  return normalized.length ? normalized : fallback;
}

function normalizeUserPayload(user) {
  const cleanCid = String(user?.cid ?? user?.idcard ?? '').replace(/\D/g, '').trim();
  const cleanFullName = String(user?.full_name ?? user?.name ?? user?.fullname ?? '').trim();
  const cleanRoles = normalizeRoleList(user?.roles ?? user?.role, []);

  return {
    cid: cleanCid,
    full_name: cleanFullName,
    name: cleanFullName,
    role: cleanRoles.join(','),
    roles: cleanRoles,
    position: String(user?.position || '').trim(),
    village_no: String(user?.village_no || '').trim(),
    phone: String(user?.phone || '').trim()
  };
}

function normalizePresetCategory(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'cc') return 'symptoms';
  if (v === 'note') return 'diagnote';
  if (['symptoms', 'symptomsco', 'diagnote', 'dose'].includes(v)) return v;
  return 'symptoms';
}

export async function verifyTenantLicense({ hospcode, licenseKey, clientType = 'pwa', cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/api/license/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hospcode: String(hospcode || '').trim(),
      license_key: String(licenseKey || '').trim(),
      client_type: clientType
    })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false || data.valid === false) {
    throw new Error(data.message || data.error || `ตรวจสอบ License ไม่สำเร็จ (${res.status})`);
  }
  const tenantObj = data.tenant || data.data?.tenant || data.data || {};
  return {
    raw: data,
    hospcode: String(tenantObj.hospcode || hospcode).trim(),
    hosp_name: tenantObj.hosp_name || data.hosp_name || `สถานบริการ ${hospcode}`,
    api_url: String(tenantObj.api_url || data.api_url || '').trim().replace(/\/+$/, ''),
    api_secret: String(tenantObj.api_secret || data.api_secret || '').trim(),
    expires_at: tenantObj.expires_at || data.expires_at || null,
    grace_days: Number(tenantObj.grace_days ?? data.grace_days ?? 3) || 3,
    status: tenantObj.status || 'active',
    signed_license_token: data.signed_license_token || data.data?.signed_license_token || ''
  };
}

export async function tenantUserLogin({ hospcode, licenseKey, cid, expectedRole = '', cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const payload = { cid: String(cid || '').replace(/\D/g, '').trim() };
  if (expectedRole) payload.expected_role = expectedRole;

  const res = await fetch(`${base}/api/tenant/user-login`, {
    method: 'POST',
    headers: buildTenantHeaders(hospcode, licenseKey),
    body: JSON.stringify(payload)
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || 'ไม่พบข้อมูลบุคลากรหรือสิทธิ์ไม่ถูกต้อง');
  }
  const user = data.user || data.data || data;
  const fullName = user.full_name || user.name || user.fullname || '';
  return {
    ...user,
    full_name: fullName,
    name: fullName,
    roles: normalizeRoleList(user.roles ?? user.role, [])
  };
}

export async function fetchTenantPresets({ hospcode, licenseKey, cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/api/tenant/presets`, {
    method: 'GET',
    headers: buildTenantHeaders(hospcode, licenseKey)
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'โหลดคลังข้อความสำเร็จรูปไม่สำเร็จ');
  }
  const list = Array.isArray(data.presets) ? data.presets : (Array.isArray(data.data) ? data.data : []);
  return list.map((p) => {
    const content = p.content ?? p.text ?? '';
    return {
      ...p,
      category: normalizePresetCategory(p.category),
      content,
      text: content
    };
  });
}

export async function listTenantUsers({ hospcode, licenseKey, adminPin, cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/api/tenant/users`, {
    method: 'GET',
    headers: buildTenantHeaders(hospcode, licenseKey, { 'x-tenant-admin-pin': String(adminPin || '').trim() })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'โหลดรายชื่อบุคลากรไม่สำเร็จ');
  }
  const list = Array.isArray(data.users) ? data.users : (Array.isArray(data.data) ? data.data : []);
  return list.map((u) => {
    const fullName = u.full_name || u.name || u.fullname || '';
    return {
      ...u,
      full_name: fullName,
      name: fullName,
      roles: normalizeRoleList(u.roles ?? u.role, [])
    };
  });
}

export async function createTenantUser({ hospcode, licenseKey, adminPin, user, cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const payload = normalizeUserPayload(user);
  const res = await fetch(`${base}/api/tenant/users`, {
    method: 'POST',
    headers: buildTenantHeaders(hospcode, licenseKey, { 'x-tenant-admin-pin': String(adminPin || '').trim() }),
    body: JSON.stringify(payload)
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'เพิ่มบุคลากรไม่สำเร็จ');
  }
  return data;
}

export async function bulkImportTenantUsers({ hospcode, licenseKey, adminPin, users, cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const normalizedUsers = (Array.isArray(users) ? users : []).map(normalizeUserPayload);
  const res = await fetch(`${base}/api/tenant/users/bulk-import`, {
    method: 'POST',
    headers: buildTenantHeaders(hospcode, licenseKey, { 'x-tenant-admin-pin': String(adminPin || '').trim() }),
    body: JSON.stringify({ users: normalizedUsers })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'นำเข้าบุคลากรจำนวนมากไม่สำเร็จ');
  }
  return data;
}

export async function deleteTenantUser({ hospcode, licenseKey, adminPin, cid, cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/api/tenant/users/${encodeURIComponent(String(cid).replace(/\D/g, '').trim())}`, {
    method: 'DELETE',
    headers: buildTenantHeaders(hospcode, licenseKey, { 'x-tenant-admin-pin': String(adminPin || '').trim() })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'ลบบุคลากรไม่สำเร็จ');
  }
  return data;
}

export async function createTenantPreset({ hospcode, licenseKey, adminPin, preset, cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const content = String(preset?.content ?? preset?.text ?? '').trim();
  const category = normalizePresetCategory(preset?.category);
  const label = String(preset?.label || content.slice(0, 30)).trim();

  const res = await fetch(`${base}/api/tenant/presets`, {
    method: 'POST',
    headers: buildTenantHeaders(hospcode, licenseKey, { 'x-tenant-admin-pin': String(adminPin || '').trim() }),
    body: JSON.stringify({
      category,
      label,
      content,
      text: content,
      sort_order: Number(preset?.sort_order) || 0
    })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'เพิ่มข้อความสำเร็จรูปไม่สำเร็จ');
  }
  return data;
}

export async function deleteTenantPreset({ hospcode, licenseKey, adminPin, id, cloudBaseUrl = CLOUD_BASE_URL }) {
  const base = String(cloudBaseUrl || CLOUD_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/api/tenant/presets/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    headers: buildTenantHeaders(hospcode, licenseKey, { 'x-tenant-admin-pin': String(adminPin || '').trim() })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'ลบข้อความสำเร็จรูปไม่สำเร็จ');
  }
  return data;
}
"""

# ==============================================================================
# 7. src/services/connectorApi.js
# ==============================================================================
FILES["src/services/connectorApi.js"] = r"""import { CARD_BRIDGE_URL } from '../config/constants.js';

async function callConnector(tenantSession, endpointPath, { method = 'GET', body = null, rawBody = null, extraHeaders = {} } = {}) {
  const apiUrl = String(tenantSession?.api_url || '').trim().replace(/\/+$/, '');
  const apiSecret = String(tenantSession?.api_secret || '').trim();
  if (!apiUrl) {
    throw new Error('ยังไม่ได้ตั้งค่า Cloudflare Tunnel URL (api_url) ของหน่วยงาน');
  }
  const headers = {
    'x-api-key': apiSecret,
    ...extraHeaders
  };
  let payload = undefined;
  if (rawBody !== null && rawBody !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
    payload = rawBody;
  } else if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${apiUrl}${endpointPath}`, {
    method,
    headers,
    body: payload
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    json = { success: false, message: text || `HTTP ${res.status}` };
  }
  if (!res.ok || json.success === false) {
    const err = new Error(json.message || `Connector error (${res.status})`);
    err.status = res.status;
    err.code = json.code;
    throw err;
  }
  return json;
}

export function checkConnectorHealth(tenantSession) {
  return callConnector(tenantSession, '/health', { method: 'GET' });
}

export function fetchTodayQueue(tenantSession) {
  return callConnector(tenantSession, '/jhcis-api/today-queue');
}

export function fetchVisitDetail(tenantSession, visitno) {
  return callConnector(tenantSession, `/jhcis-api/visit-detail/${encodeURIComponent(visitno)}`);
}

export function fetchPatientByCid(tenantSession, cid) {
  return callConnector(tenantSession, `/jhcis-api/patient/${encodeURIComponent(cid)}`);
}

export function fetchPatientPhoto(tenantSession, cid) {
  return callConnector(tenantSession, `/jhcis-api/photo/${encodeURIComponent(cid)}`);
}

export function uploadPatientPhoto(tenantSession, { cid, image }) {
  return callConnector(tenantSession, '/jhcis-api/upload-photo', {
    method: 'POST',
    body: { cid, image }
  });
}

export function fetchPatientHistory(tenantSession, cid) {
  return callConnector(tenantSession, `/jhcis-api/patient-history/${encodeURIComponent(cid)}`);
}

export function fetchReMed(tenantSession, cid) {
  return callConnector(tenantSession, `/jhcis-api/re-med/${encodeURIComponent(cid)}`);
}

export function searchIcd10(tenantSession, q) {
  return callConnector(tenantSession, `/jhcis-api/search-icd10?q=${encodeURIComponent(q)}`);
}

export function searchDrug(tenantSession, q, category = 'all') {
  return callConnector(
    tenantSession,
    `/jhcis-api/search-drug?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`
  );
}

export function saveQueueVisit(tenantSession, queuePayload) {
  return callConnector(tenantSession, '/jhcis-api/queue', {
    method: 'POST',
    body: queuePayload
  });
}

export function analyzeAiVitals(tenantSession, vitals) {
  return callConnector(tenantSession, '/jhcis-api/ai-analyze', {
    method: 'POST',
    body: { vitals }
  });
}

export function synthesizeThaiTts(tenantSession, text) {
  return callConnector(tenantSession, '/jhcis-api/tts', {
    method: 'POST',
    body: { text }
  });
}

export function submitRating(tenantSession, { cid, visitno, score }) {
  return callConnector(tenantSession, '/jhcis-api/rating', {
    method: 'POST',
    body: { cid, visitno, score }
  });
}

export function fetchResearchAnalytics(tenantSession) {
  return callConnector(tenantSession, '/jhcis-api/analytics');
}

export function vhvLoginByCid(tenantSession, cid) {
  return callConnector(tenantSession, '/jhcis-api/vhv-login', {
    method: 'POST',
    body: { cid }
  });
}

export function sendVhvHeartbeat(tenantSession, { cid, status }) {
  const apiUrl = String(tenantSession?.api_url || '').trim().replace(/\/+$/, '');
  const apiSecret = String(tenantSession?.api_secret || '').trim();
  if (!apiUrl || !apiSecret || !cid) return Promise.resolve();

  const bodyStr = JSON.stringify({ cid, status, apiKey: apiSecret });
  if (status === 'offline' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const blob = new Blob([bodyStr], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon(`${apiUrl}/jhcis-api/vhv-heartbeat`, blob);
      return Promise.resolve();
    } catch (_) {}
  }

  return fetch(`${apiUrl}/jhcis-api/vhv-heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiSecret
    },
    body: bodyStr
  }).catch(() => {});
}

export function fetchVhvStats(tenantSession) {
  return callConnector(tenantSession, '/jhcis-api/vhv-stats');
}

export function fetchVhvLogs(tenantSession, vhvCid) {
  return callConnector(tenantSession, `/jhcis-api/vhv-logs/${encodeURIComponent(vhvCid)}`);
}

export function fetchBpMonitor(tenantSession, dateStr) {
  return callConnector(tenantSession, `/jhcis-api/bp-monitor?date=${encodeURIComponent(dateStr)}`);
}

export function saveBpFollowup(tenantSession, { log_id, note }) {
  return callConnector(tenantSession, '/jhcis-api/bp-followup', {
    method: 'POST',
    body: { log_id, note }
  });
}

export async function readSmartCardBridge() {
  const res = await fetch(`${CARD_BRIDGE_URL}/card`, { method: 'GET' });
  if (!res.ok) throw new Error(`Smart Card Bridge ตอบกลับ ${res.status}`);
  return res.json();
}
"""

# ==============================================================================
# 8. src/services/offlineQueue.js & src/services/excelImport.js
# ==============================================================================
FILES["src/services/offlineQueue.js"] = r"""import { STORAGE_KEYS } from '../config/constants.js';
import { saveQueueVisit, submitRating } from './connectorApi.js';

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

export function enqueueOfflineItem(item) {
  const queue = getOfflineQueue();
  queue.push({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    ...item
  });
  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  return queue.length;
}

export async function flushOfflineQueue(tenantSession) {
  const queue = getOfflineQueue();
  if (!queue.length || !tenantSession?.api_url) {
    return { synced: 0, remaining: queue.length };
  }
  const remaining = [];
  let synced = 0;

  for (const item of queue) {
    try {
      if (item.kind === 'rating') {
        await submitRating(tenantSession, item.payload);
      } else {
        await saveQueueVisit(tenantSession, item.payload);
      }
      synced += 1;
    } catch (_) {
      remaining.push(item);
    }
  }

  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(remaining));
  return { synced, remaining: remaining.length };
}
"""

FILES["src/services/excelImport.js"] = r"""import * as XLSX from 'xlsx';
import { VALID_ROLES } from '../config/constants.js';

function normalizeCid(val) {
  return String(val ?? '').replace(/\D/g, '').trim();
}

function normalizeExcelRoles(rawRole) {
  const tokens = String(rawRole || 'vhv')
    .split(/[,|/;]+/)
    .map((token) => {
      const v = token.trim().toLowerCase();
      if (!v) return '';
      if (v === 'tenant_admin' || v === 'admin' || v.includes('แอดมิน') || v.includes('ผู้ดูแล')) return 'tenant_admin';
      if (v === 'staff' || v.includes('เจ้าหน้าที่') || v.includes('แพทย์') || v.includes('พยาบาล')) return 'staff';
      if (v === 'vhv' || v.includes('อสม')) return 'vhv';
      return v;
    })
    .filter((v) => VALID_ROLES.includes(v));

  const unique = Array.from(new Set(tokens));
  return unique.length ? unique : ['vhv'];
}

export async function parseUsersExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('ไม่พบชีตข้อมูลในไฟล์ Excel');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const users = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const cid = normalizeCid(
      row.cid ?? row.CID ?? row.idcard ?? row['เลขบัตร'] ?? row['เลขประจำตัวประชาชน'] ?? ''
    );
    const fullName = String(
      row.full_name ?? row.name ?? row.fullname ?? row['ชื่อ-สกุล'] ?? row['ชื่อสกุล'] ?? row['ชื่อ'] ?? ''
    ).trim();
    const roleRaw = row.role ?? row.roles ?? row['บทบาท'] ?? row['สิทธิ์'] ?? 'vhv';
    const position = String(row.position ?? row['ตำแหน่ง'] ?? '').trim();
    const villageNo = String(row.village_no ?? row.moo ?? row['หมู่'] ?? row['หมู่ที่'] ?? '').trim();
    const phone = String(row.phone ?? row.tel ?? row['เบอร์โทร'] ?? row['โทรศัพท์'] ?? '').trim();

    if (!cid && !fullName) return;

    if (!/^\d{13}$/.test(cid)) {
      errors.push(`แถวที่ ${rowNum}: เลขบัตรประชาชนไม่ครบ 13 หลัก (${cid || 'ว่าง'})`);
      return;
    }
    if (!fullName) {
      errors.push(`แถวที่ ${rowNum}: ไม่ระบุชื่อบุคลากร`);
      return;
    }

    const roles = normalizeExcelRoles(roleRaw);
    users.push({
      cid,
      full_name: fullName,
      name: fullName,
      role: roles.join(','),
      roles,
      position,
      village_no: villageNo,
      phone
    });
  });

  return { users, errors };
}
"""

# ==============================================================================
# 9. src/styles/app.css
# ==============================================================================
FILES["src/styles/app.css"] = r""":root {
  --bg: #f1f5f9;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --primary: #0f766e;
  --primary-hover: #0d9488;
  --primary-soft: #ccfbf1;
  --blue: #2563eb;
  --blue-hover: #1d4ed8;
  --amber: #d97706;
  --amber-soft: #fef3c7;
  --red: #dc2626;
  --red-soft: #fee2e2;
  --green: #16a34a;
  --green-soft: #dcfce7;
  --radius: 14px;
  --shadow: 0 2px 10px rgba(15, 23, 42, 0.05);
}

*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Sarabun", "Noto Sans Thai", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Top Bar */
.topbar {
  background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%);
  color: #fff;
  padding: 12px 18px;
  position: sticky;
  top: 0;
  z-index: 40;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.14);
}

.topbar-inner {
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-sub {
  font-size: 12px;
  opacity: 0.85;
}

.mode-switch {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.14);
  padding: 3px;
  border-radius: 10px;
  gap: 3px;
}

.mode-btn {
  border: none;
  background: transparent;
  color: #e2e8f0;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mode-btn.active {
  background: #ffffff;
  color: #0f172a;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.pill-online { background: #dcfce7; color: #166534; }
.pill-offline { background: #fee2e2; color: #991b1b; }
.pill-warn { background: #fef3c7; color: #92400e; }
.pill-info { background: rgba(255, 255, 255, 0.16); color: #fff; }
.pill-role { background: #e2e8f0; color: #0f172a; margin: 2px 4px 2px 0; }

/* Container & Cards */
.container {
  max-width: 1440px;
  width: 100%;
  margin: 18px auto 40px;
  padding: 0 16px;
  flex: 1;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  box-shadow: var(--shadow);
}

.card + .card { margin-top: 14px; }

.card-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.muted { color: var(--muted); font-size: 13px; }

/* Grid & Form */
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }

.field { margin-bottom: 10px; }
.field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #334155; }

input, select, textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
  color: var(--text);
}

input[type="checkbox"], input[type="radio"] {
  width: auto;
  padding: 0;
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

.role-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #fff;
}

.role-checkbox-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 !important;
  font-weight: 500 !important;
  cursor: pointer;
}

/* Buttons & Stepper */
.btn {
  border: none;
  border-radius: 9px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background 0.15s, opacity 0.15s;
}

.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
.btn-blue { background: var(--blue); color: #fff; }
.btn-blue:hover:not(:disabled) { background: var(--blue-hover); }
.btn-danger { background: var(--red); color: #fff; }
.btn-outline { background: #fff; color: var(--text); border: 1px solid #cbd5e1; }
.btn-outline:hover:not(:disabled) { background: var(--surface-2); }
.btn-sm { padding: 6px 10px; font-size: 12px; }

.stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  overflow: hidden;
  background: #fff;
}

.stepper button {
  border: none;
  background: var(--surface-2);
  padding: 6px 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.stepper span {
  padding: 0 12px;
  font-weight: 700;
  min-width: 36px;
  text-align: center;
}

/* iPadOS Split View for Staff Clinical Workspace */
.split-view {
  display: grid;
  grid-template-columns: 330px 1fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 960px) {
  .split-view { grid-template-columns: 1fr; }
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 75vh;
  overflow-y: auto;
}

.queue-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: border-color 0.15s, background 0.15s;
}

.queue-item:hover { border-color: var(--primary); background: var(--surface-2); }
.queue-item.active { border-color: var(--primary); background: #f0fdfa; box-shadow: inset 3px 0 0 var(--primary); }

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
  margin-bottom: 14px;
}

.tab-btn {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tab-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.chip {
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  color: #0f766e;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}

.chip:hover { background: #ccfbf1; }

.alert-banner {
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 12px;
}

.alert-red { background: var(--red-soft); color: #991b1b; border: 1px solid #fca5a5; }
.alert-amber { background: var(--amber-soft); color: #92400e; border: 1px solid #fcd34d; }
.alert-green { background: var(--green-soft); color: #166534; border: 1px solid #86efac; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th, td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: middle;
}

th { background: var(--surface-2); font-weight: 700; }

.stars { display: flex; gap: 8px; flex-wrap: wrap; }
.star-btn {
  font-size: 20px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 6px 12px;
  cursor: pointer;
}
.star-btn.selected { background: #fef3c7; border-color: #f59e0b; }
"""

# ==============================================================================
# 10. src/components/TenantLoginView.js (ล็อกอิน 5 หลัก + License Key)
# ==============================================================================
FILES["src/components/TenantLoginView.js"] = r"""import { CLOUD_BASE_URL } from '../config/constants.js';

export function renderTenantLoginView(initialValues = {}) {
  const hospcode = initialValues.hospcode || '';
  const licenseKey = initialValues.licenseKey || '';
  const cloudBaseUrl = initialValues.cloudBaseUrl || CLOUD_BASE_URL;

  return `
    <div class="card" style="max-width:540px;margin:28px auto;">
      <h2 class="card-title">เข้าสู่ระบบสถานบริการ (Multi-Tenant PWA)</h2>
      <p class="muted">กรอกรหัสสถานบริการ 5 หลักและ License Key เพื่อตรวจสอบสิทธิ์และเชื่อมต่อ Local JHCIS Connector ของหน่วยงาน</p>

      <form id="tenantLoginForm">
        <div class="field">
          <label for="tlHospcode">รหัสสถานบริการ 5 หลัก (hospcode)</label>
          <input id="tlHospcode" type="text" maxlength="5" pattern="\\d{5}" required placeholder="เช่น 0xxxx" value="${escapeAttr(hospcode)}" />
        </div>

        <div class="field">
          <label for="tlLicenseKey">License Key</label>
          <input id="tlLicenseKey" type="text" required placeholder="MHS-XXXX-XXXX" value="${escapeAttr(licenseKey)}" />
        </div>

        <div class="field">
          <label for="tlCloudUrl">Central Cloud Base URL</label>
          <input id="tlCloudUrl" type="url" value="${escapeAttr(cloudBaseUrl)}" />
        </div>

        <div id="tlError" class="alert-banner alert-red" style="display:none;"></div>

        <button type="submit" class="btn btn-primary" style="width:100%;padding:11px;" id="tlSubmitBtn">
          ตรวจสอบ License และเข้าใช้งาน
        </button>
      </form>
    </div>
  `;
}

function escapeAttr(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
"""

# ==============================================================================
# 11. src/components/StaffClinicalWorkspace.js (โหมดเจ้าหน้าที่ Split View ครบทุกแท็บ)
# ==============================================================================
FILES["src/components/StaffClinicalWorkspace.js"] = r"""export function renderStaffClinicalWorkspace({ staffUser, tenantSession, presets = [] }) {
  const ccPresets = presets.filter((p) => ['symptoms', 'cc'].includes(String(p.category || 'symptoms').toLowerCase()));
  const piPresets = presets.filter((p) => String(p.category || '').toLowerCase() === 'symptomsco');
  const notePresets = presets.filter((p) => ['diagnote', 'note'].includes(String(p.category || '').toLowerCase()));
  const dosePresets = presets.filter((p) => String(p.category || '').toLowerCase() === 'dose');

  const staffName = staffUser.full_name || staffUser.name || `เจ้าหน้าที่ ${staffUser.cid}`;

  return `
    <div class="card" style="margin-bottom:14px;padding:12px 16px;">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
        <div>
          <strong>โต๊ะตรวจเจ้าหน้าที่ (StaffClinicalWorkspace)</strong>
          <span class="muted" style="margin-left:8px;">ผู้ปฏิบัติงาน: <strong>${esc(staffName)}</strong> (${esc(staffUser.cid)})</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" id="btnRefreshQueue">รีเฟรชคิววันนี้</button>
          <button type="button" class="btn btn-primary btn-sm" id="btnNewVisitMode">+ เปิดคิว / บันทึกใหม่</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnStaffLogout">ออกจากระบบเจ้าหน้าที่</button>
        </div>
      </div>
    </div>

    <div class="split-view">
      <!-- Left Sidebar: คิวตรวจวันนี้จาก JHCIS -->
      <div class="card">
        <h3 class="card-title">
          <span>คิวตรวจวันนี้</span>
          <span class="pill pill-role" id="queueCountBadge">0</span>
        </h3>
        <div class="field">
          <input type="text" id="queueFilterInput" placeholder="ค้นหาชื่อ หรือเลขบัตร 13 หลัก..." />
        </div>
        <div class="queue-list" id="todayQueueList">
          <div class="muted">กำลังโหลดคิวจาก JHCIS...</div>
        </div>
      </div>

      <!-- Right Main Workspace -->
      <div class="card">
        <div id="staffAlertBanner" class="alert-banner" style="display:none;"></div>

        <!-- ค้นหา / เลือกผู้ป่วย -->
        <div class="grid-3" style="align-items:end;margin-bottom:12px;">
          <div class="field" style="margin-bottom:0;">
            <label for="staffCidInput">เลขบัตรประชาชนผู้ป่วย (13 หลัก)</label>
            <input type="text" id="staffCidInput" maxlength="13" placeholder="กรอกเลขบัตร 13 หลัก" />
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-blue" id="btnStaffSearchCid">ค้นหาผู้ป่วย</button>
            <button type="button" class="btn btn-outline" id="btnStaffReadCard">อ่านบัตร</button>
          </div>
          <div>
            <span class="pill pill-role" id="visitModeBadge">โหมด: สร้าง Visit ใหม่</span>
          </div>
        </div>

        <div id="patientSummaryBar" class="alert-banner alert-green" style="display:none;"></div>
        <div id="allergyWarningBar" class="alert-banner alert-red" style="display:none;"></div>

        <!-- แท็บการทำงาน -->
        <div class="tabs" id="staffTabs">
          <button type="button" class="tab-btn active" data-tab="vitals">1. ซักประวัติ &amp; สัญญาณชีพ</button>
          <button type="button" class="tab-btn" data-tab="dxrx">2. ICD-10 &amp; สั่งยา/หัตถการ</button>
          <button type="button" class="tab-btn" data-tab="special">3. DTX / SpecialPP / เด็ก 0-60ด.</button>
          <button type="button" class="tab-btn" data-tab="history">4. ประวัติย้อนหลัง</button>
          <button type="button" class="tab-btn" data-tab="ai_tele">5. คัดกรอง AI &amp; Telemedicine</button>
        </div>

        <!-- Tab 1: Vitals + CC/PI + Presets -->
        <div class="staff-tab-panel" data-panel="vitals">
          <div class="grid-2">
            <div class="field">
              <label for="stSymptoms">อาการสำคัญ (CC / symptoms)</label>
              <input type="text" id="stSymptoms" placeholder="เช่น ปวดเมื่อยกล้ามเนื้อ / ตรวจติดตามอาการ" />
              <div class="preset-chips">
                ${ccPresets.map((p) => {
                  const val = p.content || p.text || '';
                  return `<button type="button" class="chip" data-fill-target="stSymptoms" data-fill-text="${escAttr(val)}">${esc(p.label || val)}</button>`;
                }).join('')}
              </div>
            </div>
            <div class="field">
              <label for="stSymptomsco">อาการร่วม / PI (symptomsco)</label>
              <input type="text" id="stSymptomsco" placeholder="รายละเอียดเพิ่มเติม" />
              <div class="preset-chips">
                ${piPresets.map((p) => {
                  const val = p.content || p.text || '';
                  return `<button type="button" class="chip" data-fill-target="stSymptomsco" data-fill-text="${escAttr(val)}">${esc(p.label || val)}</button>`;
                }).join('')}
              </div>
            </div>
          </div>

          <div class="grid-4">
            <div class="field"><label>น้ำหนัก (kg)</label><input type="number" step="0.1" id="stWeight" /></div>
            <div class="field"><label>ส่วนสูง (cm)</label><input type="number" step="0.1" id="stHeight" /></div>
            <div class="field"><label>ความดัน (mmHg)</label><input type="text" id="stPressure" placeholder="120/80" /></div>
            <div class="field"><label>ชีพจร (bpm)</label><input type="number" id="stPulse" /></div>
            <div class="field"><label>อุณหภูมิ (°C)</label><input type="number" step="0.1" id="stTemp" /></div>
            <div class="field"><label>รอบเอว (cm)</label><input type="number" step="0.1" id="stWaist" /></div>
            <div class="field">
              <label>ช่วงเวลาบริการ</label>
              <select id="stTimeService">
                <option value="1">1 = ในเวลาราชการ</option>
                <option value="2">2 = นอกเวลาราชการ</option>
              </select>
            </div>
            <div class="field">
              <label>บันทึกแพทย์/เจ้าหน้าที่ (diagnote)</label>
              <input type="text" id="stDiagNote" placeholder="หมายเหตุการตรวจ" />
              <div class="preset-chips">
                ${notePresets.map((p) => {
                  const val = p.content || p.text || '';
                  return `<button type="button" class="chip" data-fill-target="stDiagNote" data-fill-text="${escAttr(val)}">${esc(p.label || val)}</button>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 2: ICD-10 + Drug/Service + Re Med -->
        <div class="staff-tab-panel" data-panel="dxrx" style="display:none;">
          <datalist id="dosePresetsList">
            ${dosePresets.map((p) => `<option value="${escAttr(p.content || p.text || '')}">${esc(p.label || '')}</option>`).join('')}
          </datalist>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <button type="button" class="btn btn-blue btn-sm" id="btnReMed">Re Med. (ดึงยา/โรคครั้งล่าสุด)</button>
            <span class="muted" id="reMedInfo"></span>
          </div>

          <div class="grid-2">
            <div>
              <label>ค้นหารหัสโรค ICD-10</label>
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <input type="text" id="icdSearchInput" placeholder="พิมพ์รหัสหรือชื่อโรค เช่น I10, J06" />
                <button type="button" class="btn btn-outline btn-sm" id="btnSearchIcd">ค้นหา</button>
              </div>
              <div id="icdSearchResults" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:6px;margin-bottom:10px;"></div>

              <strong>รายการ ICD-10 ที่เลือก</strong>
              <table>
                <thead><tr><th>รหัส</th><th>DxType</th><th>วันนัด</th><th>ลบ</th></tr></thead>
                <tbody id="selectedIcdBody"><tr><td colspan="4" class="muted">ยังไม่ได้เลือกรหัส ICD-10</td></tr></tbody>
              </table>
            </div>

            <div>
              <label>ค้นหายา / สมุนไพร / หัตถการ</label>
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <select id="drugCategorySelect" style="width:130px;">
                  <option value="all">ทั้งหมด</option>
                  <option value="herb">สมุนไพร (10)</option>
                  <option value="service">หัตถการ (02,03)</option>
                  <option value="dental">ทันตกรรม (06,02)</option>
                  <option value="adp">ADP (11)</option>
                </select>
                <input type="text" id="drugSearchInput" placeholder="พิมพ์ชื่อยา/สมุนไพร/หัตถการ" />
                <button type="button" class="btn btn-outline btn-sm" id="btnSearchDrug">ค้นหา</button>
              </div>
              <div id="drugSearchResults" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:6px;margin-bottom:10px;"></div>

              <strong>รายการยา / สมุนไพร / หัตถการ ที่สั่ง</strong>
              <table>
                <thead><tr><th>รายการ</th><th>จำนวน (Stepper)</th><th>วิธีใช้</th><th>ลบ</th></tr></thead>
                <tbody id="selectedDrugBody"><tr><td colspan="4" class="muted">ยังไม่มีรายการยา/สมุนไพร/หัตถการ</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 3: DTX + SpecialPP + เด็ก 0-60 เดือน -->
        <div class="staff-tab-panel" data-panel="special" style="display:none;">
          <div class="grid-3">
            <div class="field"><label>น้ำตาล DTX (mg/dL)</label><input type="number" step="0.1" id="stSugar" /></div>
            <div class="field"><label>สถานะการอดอาหาร</label><input type="text" id="stSugarFasting" placeholder="เช่น NPO / หลังอาหาร 2 ชม." /></div>
            <div class="field"><label>อายุเป็นเดือน (เด็ก 0-60ด.)</label><input type="number" id="stAgeMonths" placeholder="คำนวณอัตโนมัติจากคนไข้" /></div>
          </div>

          <div class="grid-2" style="margin-top:8px;">
            <div class="card" style="padding:12px;">
              <strong>SpecialPP: บุหรี่ &amp; สุรา</strong>
              <div class="field" style="margin-top:8px;">
                <label>สถานะการสูบบุหรี่</label>
                <select id="stSmokeStatus">
                  <option value="">-- ไม่ระบุ --</option>
                  <option value="ไม่สูบ">ไม่สูบ (1B52)</option>
                  <option value="เคยสูบแต่เลิกแล้ว">เคยสูบแต่เลิกแล้ว (1B51)</option>
                  <option value="ยังสูบอยู่">ยังสูบอยู่</option>
                </select>
              </div>
              <div class="field">
                <label>สถานะการดื่มสุรา</label>
                <select id="stAlcoholStatus">
                  <option value="">-- ไม่ระบุ --</option>
                  <option value="ไม่ดื่ม">ไม่ดื่ม (1B600)</option>
                  <option value="เคยดื่มแต่เลิกแล้ว">เคยดื่มแต่เลิกแล้ว (1B601)</option>
                  <option value="ยังดื่มอยู่">ยังดื่มอยู่</option>
                </select>
              </div>
            </div>

            <div class="card" style="padding:12px;">
              <strong>โภชนาการเด็ก 0-60 เดือน (visitnutrition)</strong>
              <div class="grid-2" style="margin-top:8px;">
                <div class="field"><label>รอบศีรษะ (cm)</label><input type="number" step="0.1" id="stHeadCircum" /></div>
                <div class="field">
                  <label>ระดับโภชนาการ (nlevel)</label>
                  <select id="stNlevel">
                    <option value="3">ปกติ (3)</option>
                    <option value="1">ผอม/ต่ำกว่าเกณฑ์ (1)</option>
                    <option value="2">เริ่มอ้วน/สูงกว่าเกณฑ์ (2)</option>
                    <option value="99">รหัส 99 (แปลงเป็น 3, NULL, NULL)</option>
                  </select>
                </div>
                <div class="field"><label>nlevel2</label><input type="text" id="stNlevel2" value="3" /></div>
                <div class="field"><label>nlevel3 / พัฒนาการ</label><input type="text" id="stNlevel3" value="4" /></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab 4: ประวัติย้อนหลัง -->
        <div class="staff-tab-panel" data-panel="history" style="display:none;">
          <div id="patientHistoryBox" class="muted">เลือกผู้ป่วยเพื่อดูประวัติการรับบริการย้อนหลัง 10 ครั้ง</div>
        </div>

        <!-- Tab 5: คัดกรอง AI & Telemedicine -->
        <div class="staff-tab-panel" data-panel="ai_tele" style="display:none;">
          <div class="grid-2">
            <div class="card" style="padding:14px;">
              <strong>AI วิเคราะห์ความเสี่ยงเบื้องต้น</strong>
              <p class="muted">ประเมินจากความดัน น้ำตาล และน้ำหนักของคนไข้ปัจจุบัน</p>
              <button type="button" class="btn btn-blue btn-sm" id="btnRunStaffAi">วิเคราะห์ด้วย AI</button>
              <div id="staffAiResult" class="alert-banner" style="display:none;margin-top:10px;"></div>
            </div>
            <div class="card" style="padding:14px;">
              <strong>Telemedicine (Jitsi Meet)</strong>
              <div class="field" style="margin-top:8px;">
                <label>ชื่อห้องประชุม Tele-consultation</label>
                <input type="text" id="jitsiRoomInput" value="mini-health-${escAttr(tenantSession.hospcode || 'room')}" />
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="btnOpenJitsi">เปิดห้อง Telemedicine (Jitsi)</button>
              <div id="jitsiContainer" style="margin-top:10px;"></div>
            </div>
          </div>
        </div>

        <!-- ปุ่มบันทึกหลัก -->
        <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" class="btn btn-primary" style="padding:11px 22px;" id="btnSaveStaffQueue">
            บันทึกข้อมูลเข้า JHCIS
          </button>
        </div>
      </div>
    </div>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
"""

# ==============================================================================
# 12. src/components/VhvKioskView.js (โหมด อสม. คัดกรอง NCD/เด็ก + บัตร + ความพึงพอใจ + ออฟไลน์)
# ==============================================================================
FILES["src/components/VhvKioskView.js"] = r"""export function renderVhvKioskView({ vhvUser, offlineCount = 0 }) {
  return `
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;">
        <div>
          <h2 class="card-title" style="margin:0;">โหมด อสม. คัดกรองสุขภาพ (Kiosk)</h2>
          <span class="muted">ผู้ใช้งาน: <strong>${esc(vhvUser.full_name || vhvUser.name)}</strong> (${esc(vhvUser.cid)})</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="pill ${offlineCount > 0 ? 'pill-warn' : 'pill-online'}" id="kioskOfflinePill">
            คิวค้างส่ง: ${offlineCount} รายการ
          </span>
          <button type="button" class="btn btn-blue btn-sm" id="btnSyncOfflineNow">ซิงก์คิวค้างส่งทันที</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnVhvLogout">ออกจากระบบ อสม.</button>
        </div>
      </div>

      <div id="kioskAlert" class="alert-banner" style="display:none;"></div>

      <div class="grid-3" style="align-items:end;">
        <div class="field">
          <label for="kioskCid">เลขบัตรประชาชนผู้รับบริการ (13 หลัก)</label>
          <input type="text" id="kioskCid" maxlength="13" placeholder="กรอกเลขบัตร 13 หลัก" />
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <button type="button" class="btn btn-blue" id="btnKioskLookup">ค้นหาผู้รับบริการ</button>
          <button type="button" class="btn btn-outline" id="btnKioskReadCard">อ่านบัตร (8189)</button>
        </div>
        <div class="field">
          <label for="kioskServiceType">ประเภทการคัดกรอง</label>
          <select id="kioskServiceType">
            <option value="ncd">คัดกรอง NCD / ติดตามกลุ่มสีเขียว</option>
            <option value="screening">คัดกรอง DM/HT อายุ 35 ปีขึ้นไป</option>
            <option value="child">ตรวจภาวะโภชนาการเด็ก 0-60 เดือน</option>
          </select>
        </div>
      </div>

      <div id="kioskPatientCard" class="alert-banner alert-green" style="display:none;"></div>

      <div class="grid-4">
        <div class="field"><label>น้ำหนัก (kg)</label><input type="number" step="0.1" id="kioskWeight" /></div>
        <div class="field"><label>ส่วนสูง (cm)</label><input type="number" step="0.1" id="kioskHeight" /></div>
        <div class="field"><label>ความดัน (mmHg)</label><input type="text" id="kioskPressure" placeholder="120/80" /></div>
        <div class="field"><label>ชีพจร (bpm)</label><input type="number" id="kioskPulse" /></div>
        <div class="field"><label>อุณหภูมิ (°C)</label><input type="number" step="0.1" id="kioskTemp" /></div>
        <div class="field"><label>รอบเอว (cm)</label><input type="number" step="0.1" id="kioskWaist" /></div>
        <div class="field"><label>น้ำตาล DTX (mg/dL)</label><input type="number" step="0.1" id="kioskSugar" /></div>
        <div class="field"><label>อายุเดือน (เด็ก)</label><input type="number" id="kioskAgeMonths" /></div>
      </div>

      <!-- ประเมินความพึงพอใจ 5 ดาว -->
      <div class="card" style="padding:12px;margin-top:8px;background:var(--surface-2);">
        <label style="margin-bottom:6px;display:block;font-size:12px;font-weight:600;">ประเมินความพึงพอใจการรับบริการ (1 - 5 ดาว)</label>
        <div class="stars" id="ratingStars">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn ${n === 5 ? 'selected' : ''}" data-score="${n}">${'★'.repeat(n)} (${n})</button>`).join('')}
        </div>
      </div>

      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" style="padding:11px 22px;" id="btnSubmitKiosk">
          บันทึกข้อมูลคัดกรอง
        </button>
      </div>
    </div>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
"""

# ==============================================================================
# 13. src/components/TenantAdminView.js (โหมด Admin ประจำหน่วยงาน + Multi-Role + Excel + Presets)
# ==============================================================================
FILES["src/components/TenantAdminView.js"] = r"""export function renderTenantAdminView({ tenantSession, adminPin = '', offlineCount = 0 }) {
  return `
    <div class="card">
      <h2 class="card-title">โหมดผู้ดูแลระบบประจำหน่วยงาน (Tenant Admin)</h2>
      <p class="muted">หน่วยงาน: <strong>${esc(tenantSession.hosp_name || '-')}</strong> (${esc(tenantSession.hospcode)}) | Connector URL: <code>${esc(tenantSession.api_url || '-')}</code></p>

      <div class="grid-3" style="align-items:end;margin-bottom:14px;">
        <div class="field" style="margin-bottom:0;">
          <label for="adminPinInput">รหัส PIN ผู้ดูแลประจำหน่วยงาน (x-tenant-admin-pin)</label>
          <input type="password" id="adminPinInput" placeholder="กรอกรหัส PIN Admin" value="${escAttr(adminPin)}" />
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" id="btnLoadAdminData">โหลดข้อมูลบุคลากร &amp; คลังข้อความ</button>
          <button type="button" class="btn btn-blue" id="btnRefreshAdminLive">รีเฟรชสถิติ อสม. / BP / วิจัย</button>
        </div>
        <div>
          <span class="pill ${offlineCount > 0 ? 'pill-warn' : 'pill-online'}">คิวออฟไลน์ค้างส่ง: ${offlineCount}</span>
        </div>
      </div>

      <div id="adminAlert" class="alert-banner" style="display:none;"></div>

      <div class="tabs" id="adminTabs">
        <button type="button" class="tab-btn active" data-atab="users">จัดการบุคลากร &amp; นำเข้า Excel</button>
        <button type="button" class="tab-btn" data-atab="presets">คลังข้อความสำเร็จรูป</button>
        <button type="button" class="tab-btn" data-atab="vhv_bp">สถิติ อสม. &amp; BP Monitor</button>
        <button type="button" class="tab-btn" data-atab="analytics">Dashboard งานวิจัย</button>
        <button type="button" class="tab-btn" data-atab="settings">ตั้งค่าระบบ &amp; ออกจาก Tenant</button>
      </div>

      <!-- Tab 1: Users + Excel Bulk Import -->
      <div class="admin-tab-panel" data-apanel="users">
        <div class="grid-2">
          <div class="card" style="padding:14px;">
            <strong>เพิ่ม / แก้ไขบุคลากรรายบุคคล</strong>
            <div class="field" style="margin-top:8px;"><label>เลขบัตรประชาชน (13 หลัก)</label><input type="text" id="newUserCid" maxlength="13" placeholder="13 หลัก" /></div>
            <div class="field"><label>ชื่อ-สกุล</label><input type="text" id="newUserName" placeholder="เช่น นายดี ยินดี" /></div>
            <div class="field">
              <label>บทบาท / สิทธิ์การใช้งาน (เลือกได้มากกว่า 1 บทบาท)</label>
              <div class="role-checkbox-group">
                <label class="role-checkbox-item">
                  <input type="checkbox" class="new-user-role-cb" value="staff" checked />
                  เจ้าหน้าที่ (staff)
                </label>
                <label class="role-checkbox-item">
                  <input type="checkbox" class="new-user-role-cb" value="tenant_admin" />
                  ผู้ดูแลหน่วยงาน (tenant_admin)
                </label>
                <label class="role-checkbox-item">
                  <input type="checkbox" class="new-user-role-cb" value="vhv" />
                  อสม. (vhv)
                </label>
              </div>
            </div>
            <div class="grid-3">
              <div class="field"><label>ตำแหน่ง (position)</label><input type="text" id="newUserPosition" placeholder="เช่น อสม." /></div>
              <div class="field"><label>หมู่ที่ (village_no)</label><input type="text" id="newUserVillageNo" placeholder="เช่น 5" /></div>
              <div class="field"><label>เบอร์โทร (phone)</label><input type="text" id="newUserPhone" placeholder="08xxxxxxxx" /></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-primary btn-sm" id="btnAddSingleUser">บันทึกบุคลากร</button>
              <button type="button" class="btn btn-outline btn-sm" id="btnClearUserForm">ล้างฟอร์ม</button>
            </div>
          </div>

          <div class="card" style="padding:14px;">
            <strong>นำเข้าบุคลากรจากไฟล์ Excel (.xlsx / .csv)</strong>
            <p class="muted">รองรับคอลัมน์ <code>cid</code>, <code>full_name</code> (หรือ <code>name</code>), <code>role</code> (ใส่หลายบทบาทคั่นด้วยจุลภาคได้ เช่น <code>staff,tenant_admin</code>), <code>position</code>, <code>village_no</code>, <code>phone</code></p>
            <div class="field">
              <input type="file" id="excelUsersFile" accept=".xlsx,.xls,.csv" />
            </div>
            <div id="excelPreviewBox" class="muted" style="margin-bottom:8px;">ยังไม่ได้เลือกไฟล์</div>
            <button type="button" class="btn btn-blue btn-sm" id="btnUploadExcelUsers" disabled>นำเข้าข้อมูลทั้งหมดขึ้นระบบกลาง</button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <strong>รายชื่อบุคลากรในระบบกลาง</strong>
          <table>
            <thead><tr><th>เลขบัตร</th><th>ชื่อ-สกุล</th><th>บทบาท</th><th>ตำแหน่ง / หมู่ / เบอร์โทร</th><th>จัดการ</th></tr></thead>
            <tbody id="tenantUsersTableBody"><tr><td colspan="5" class="muted">กรอก PIN แล้วกด "โหลดข้อมูลบุคลากร &amp; คลังข้อความ"</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- Tab 2: Presets -->
      <div class="admin-tab-panel" data-apanel="presets" style="display:none;">
        <div class="grid-3" style="align-items:end;margin-bottom:12px;">
          <div class="field" style="margin-bottom:0;">
            <label>หมวดหมู่</label>
            <select id="newPresetCategory">
              <option value="symptoms">อาการสำคัญ (symptoms / CC)</option>
              <option value="symptomsco">อาการร่วม (symptomsco / PI)</option>
              <option value="diagnote">บันทึกแพทย์/หมายเหตุ (diagnote)</option>
              <option value="dose">วิธีใช้ยา (dose)</option>
            </select>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>ป้ายกำกับสั้นๆ</label>
            <input type="text" id="newPresetLabel" placeholder="เช่น ปวดเข่าข้างขวา" />
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>ข้อความเต็มที่จะแทรก</label>
            <input type="text" id="newPresetText" placeholder="ปวดเข่าข้างขวาเวลาเดินขึ้นบันได" />
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="btnAddPreset">+ เพิ่มข้อความสำเร็จรูป</button>

        <table style="margin-top:12px;">
          <thead><tr><th>หมวด</th><th>ป้ายกำกับ</th><th>ข้อความ</th><th>จัดการ</th></tr></thead>
          <tbody id="tenantPresetsTableBody"><tr><td colspan="4" class="muted">ยังไม่มีข้อมูล</td></tr></tbody>
        </table>
      </div>

      <!-- Tab 3: VHV Stats & BP Monitor -->
      <div class="admin-tab-panel" data-apanel="vhv_bp" style="display:none;">
        <div class="grid-2">
          <div>
            <strong>สถิติผลงาน อสม. (Real-time)</strong>
            <table>
              <thead><tr><th>ชื่อ อสม.</th><th>สถานะ</th><th>คัดกรอง (คน)</th><th>BP</th><th>DTX</th></tr></thead>
              <tbody id="vhvStatsBody"><tr><td colspan="5" class="muted">กดรีเฟรชเพื่อโหลด</td></tr></tbody>
            </table>
          </div>
          <div>
            <strong>เฝ้าระวังความดันโลหิตสูง (BP Monitor)</strong>
            <div style="display:flex;gap:6px;margin:8px 0;">
              <input type="date" id="bpMonitorDate" value="${new Date().toISOString().slice(0, 10)}" style="max-width:180px;" />
              <button type="button" class="btn btn-outline btn-sm" id="btnLoadBpMonitor">ดูรายการ BP สูง</button>
            </div>
            <table>
              <thead><tr><th>ผู้ป่วย</th><th>BP</th><th>ระดับ</th><th>ติดตาม</th></tr></thead>
              <tbody id="bpMonitorBody"><tr><td colspan="4" class="muted">ยังไม่ได้โหลด</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tab 4: Research Analytics -->
      <div class="admin-tab-panel" data-apanel="analytics" style="display:none;">
        <div id="researchSummaryBox" class="alert-banner alert-green">กด "รีเฟรชสถิติ อสม. / BP / วิจัย" เพื่อประมวลผลสถิติจาก JHCIS</div>
        <div id="researchCardsGrid" class="grid-4"></div>
      </div>

      <!-- Tab 5: Tenant Settings -->
      <div class="admin-tab-panel" data-apanel="settings" style="display:none;">
        <p><strong>Hospcode:</strong> ${esc(tenantSession.hospcode)}</p>
        <p><strong>วันหมดอายุ License:</strong> ${esc(tenantSession.expires_at || '-')}</p>
        <p><strong>Offline Grace Days:</strong> ${esc(tenantSession.grace_days ?? 3)} วัน</p>
        <button type="button" class="btn btn-danger" id="btnSwitchTenant">ออกจากเซสชันสถานบริการนี้ (สลับหน่วยงาน)</button>
      </div>
    </div>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
"""

# ==============================================================================
# 14. src/main.js (ตัวประสานหลักของ Central Web App Multi-Tenant PWA)
# ==============================================================================
FILES["src/main.js"] = r"""import './styles/app.css';
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

const appEl = document.getElementById('app');

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
  adminPin: '',
  adminUsersList: [],
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
      const cloudBaseUrl = document.getElementById('tlCloudUrl').value.trim() || CLOUD_BASE_URL;

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
          <button type="submit" class="btn btn-primary" style="width:100%;">เข้าสู่หน้าโต๊ะตรวจทันที</button>
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
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      const cid = document.getElementById('staffLoginCid').value.replace(/\D/g, '').trim();
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
        errBox.textContent = err.message;
        errBox.style.display = 'block';
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
          <button type="submit" class="btn btn-primary" style="width:100%;">เข้าสู่โหมด อสม.</button>
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
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      const cid = document.getElementById('vhvLoginCid').value.replace(/\D/g, '').trim();
      try {
        const res = await vhvLoginByCid(state.tenantSession, cid);
        const info = res.data || {};
        const displayName = info.full_name || info.name || `อสม. ${cid}`;
        state.vhvUser = { cid: info.cid || cid, name: displayName, full_name: displayName };
        saveJson(STORAGE_KEYS.VHV_SESSION, state.vhvUser);
        renderApp();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
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

function bindAdminEvents() {
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
    state.adminPin = document.getElementById('adminPinInput').value.trim();
    if (!state.adminPin) return showAdminAlert('alert-amber', 'กรุณากรอกรหัส PIN Admin ของหน่วยงาน');
    await Promise.all([loadAdminUsers(), loadAdminPresets()]);
  });

  document.getElementById('btnClearUserForm').addEventListener('click', resetAdminUserForm);

  document.getElementById('btnAddSingleUser').addEventListener('click', async () => {
    state.adminPin = document.getElementById('adminPinInput').value.trim();
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
    state.adminPin = document.getElementById('adminPinInput').value.trim();
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
    state.adminPin = document.getElementById('adminPinInput').value.trim();
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
    state.tenantSession = null;
    state.staffUser = null;
    state.vhvUser = null;
    saveJson(STORAGE_KEYS.TENANT_SESSION, null);
    saveJson(STORAGE_KEYS.STAFF_SESSION, null);
    saveJson(STORAGE_KEYS.VHV_SESSION, null);
    renderApp();
  });
}

async function loadAdminUsers() {
  const tbody = document.getElementById('tenantUsersTableBody');
  try {
    const users = await listTenantUsers({
      hospcode: state.tenantSession.hospcode,
      licenseKey: state.tenantSession.license_key,
      adminPin: state.adminPin,
      cloudBaseUrl: state.tenantSession.cloud_base_url
    });
    state.adminUsersList = users;

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
  } catch (err) {
    showAdminAlert('alert-red', err.message);
  }
}

async function loadAdminPresets() {
  const tbody = document.getElementById('tenantPresetsTableBody');
  try {
    const presets = await fetchTenantPresets({
      hospcode: state.tenantSession.hospcode,
      licenseKey: state.tenantSession.license_key,
      cloudBaseUrl: state.tenantSession.cloud_base_url
    });
    state.presets = presets;
    saveJson(STORAGE_KEYS.PRESETS_CACHE, presets);

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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

renderApp();
refreshConnectorStatus();
"""


def main():
    print(f"=== กำลังสร้างไฟล์ Phase 3 (Central Web App Multi-Tenant PWA) ใน: {BASE_DIR} ===")
    for rel_path, content in FILES.items():
        target = BASE_DIR / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        print(f"  [OK] {rel_path}")

    print("\nเสร็จสมบูรณ์! ขั้นตอนถัดไป:")
    print("  1. cd mini-health-saas/web-app")
    print("  2. npm install")
    print("  3. npm run dev   (หรือ npm run build เพื่อ Deploy บน Cloudflare Pages / Vercel)")


if __name__ == "__main__":
    main()