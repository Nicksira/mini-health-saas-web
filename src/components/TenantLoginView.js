import { CLOUD_BASE_URL } from '../config/constants.js';

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
