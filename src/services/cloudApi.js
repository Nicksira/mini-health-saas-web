import { CLOUD_BASE_URL, VALID_ROLES } from '../config/constants.js';

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
