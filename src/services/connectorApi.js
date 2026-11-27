import { CARD_BRIDGE_URL } from '../config/constants.js';

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
