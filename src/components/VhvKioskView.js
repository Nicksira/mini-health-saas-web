export function renderVhvKioskView({ vhvUser, offlineCount = 0 }) {
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
