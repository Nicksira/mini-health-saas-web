import { CLOUD_BASE_URL } from '../config/constants.js';

export function renderTenantLoginView(initialValues = {}) {
  const hospcode = initialValues.hospcode || '';
  const licenseKey = initialValues.licenseKey || '';
  const cloudBaseUrl = initialValues.cloudBaseUrl || CLOUD_BASE_URL;

  return `
    <div class="mhs-login-stage">
      <video class="mhs-login-video" autoplay loop muted playsinline>
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>
      <div class="mhs-login-scrim"></div>

      <div class="card mhs-login-card">
        <div class="mhs-login-badge">
          <img src="/TK.png" alt="Mini Health Station" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block';" />
          <i class="fa-solid fa-heart-pulse" style="display:none;font-size:28px;color:#0D9488;"></i>
        </div>

        <h2 class="card-title" style="justify-content:center;text-align:center;font-size:22px;margin-bottom:6px;">
          เข้าสู่ระบบสถานบริการ
        </h2>
        <p class="muted" style="text-align:center;margin:0 0 22px;line-height:1.5;">
          กรอกรหัสสถานบริการ 5 หลัก และ License Key<br />เพื่อเชื่อมต่อ Local JHCIS Connector ของหน่วยงาน
        </p>

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
