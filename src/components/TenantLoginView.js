import { CLOUD_BASE_URL } from '../config/constants.js';

export function renderTenantLoginView(initialValues = {}) {
  const hospcode = initialValues.hospcode || '';
  const licenseKey = initialValues.licenseKey || '';
  const cloudBaseUrl = initialValues.cloudBaseUrl || CLOUD_BASE_URL;

  return `
    <div class="mhs-login-stage">
      <video class="mhs-standby-video" autoplay loop muted playsinline>
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>

      <div class="card mhs-login-card">
        <div style="text-align:center;margin-bottom:18px;">
          <img src="/TK.png" alt="Mini Health Station" style="height:74px;max-width:260px;object-fit:contain;margin:0 auto 6px;display:block;" onerror="this.style.display='none'" />
          <h2 class="mhs-aurora-title" style="font-size:28px;">Mini Health Station</h2>
          <p class="muted" style="margin:6px 0 0;">เข้าสู่ระบบสถานบริการ (Multi-Tenant PWA)</p>
        </div>

        <form id="tenantLoginForm">
          <input id="tlCloudUrl" type="hidden" value="${escapeAttr(cloudBaseUrl)}" />

          <div class="field">
            <label for="tlHospcode">รหัสสถานบริการ 5 หลัก (hospcode)</label>
            <input id="tlHospcode" type="text" maxlength="5" pattern="\\d{5}" required placeholder="เช่น 02506" value="${escapeAttr(hospcode)}" style="font-size:18px;font-weight:700;letter-spacing:1px;" />
          </div>

          <div class="field">
            <label for="tlLicenseKey">License Key</label>
            <input id="tlLicenseKey" type="text" required placeholder="MHS-XXXXX-XXXX-XXXX" value="${escapeAttr(licenseKey)}" style="font-size:15px;font-weight:600;letter-spacing:0.5px;" />
          </div>

          <div id="tlError" class="alert-banner alert-red" style="display:none;"></div>

          <button type="submit" class="btn btn-primary" style="width:100%;padding:13px;font-size:15.5px;margin-top:6px;" id="tlSubmitBtn">
            <i class="fa-solid fa-shield-halved"></i> ตรวจสอบ License และเข้าใช้งาน
          </button>
        </form>
      </div>
    </div>
  `;
}

function escapeAttr(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
