export function renderStaffClinicalWorkspace({ staffUser, tenantSession, presets = [] }) {
  const ccPresets = presets.filter((p) => ['symptoms', 'cc'].includes(String(p.category || 'symptoms').toLowerCase()));
  const piPresets = presets.filter((p) => String(p.category || '').toLowerCase() === 'symptomsco');
  const notePresets = presets.filter((p) => ['diagnote', 'note'].includes(String(p.category || '').toLowerCase()));
  const dosePresets = presets.filter((p) => String(p.category || '').toLowerCase() === 'dose');

  const staffName = staffUser.full_name || staffUser.name || `เจ้าหน้าที่ ${staffUser.cid}`;

  return `
    <div class="card" style="margin-bottom:14px;padding:14px 18px !important;">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(0,122,255,0.1);color:#007AFF;display:flex;align-items:center;justify-content:center;font-size:18px;">
            <i class="fa-solid fa-user-doctor"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:16px;">โต๊ะตรวจเจ้าหน้าที่ (Clinical Workspace)</div>
            <div class="muted">ผู้ปฏิบัติงาน: <strong>${esc(staffName)}</strong> (${esc(staffUser.cid)})</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" id="btnRefreshQueue">
            <i class="fa-solid fa-rotate"></i> รีเฟรชคิววันนี้
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btnNewVisitMode">
            <i class="fa-solid fa-plus"></i> เปิดคิว / บันทึกใหม่
          </button>
          <button type="button" class="btn btn-outline btn-sm" id="btnStaffLogout">
            <i class="fa-solid fa-right-from-bracket"></i> ออกจากระบบ
          </button>
        </div>
      </div>
    </div>

    <div class="split-view">
      <div class="card">
        <h3 class="card-title">
          <span><i class="fa-solid fa-list-ul" style="color:#0D9488;margin-right:6px;"></i>คิวตรวจวันนี้</span>
          <span class="pill pill-role" id="queueCountBadge">0</span>
        </h3>
        <div class="field">
          <input type="text" id="queueFilterInput" placeholder="ค้นหาชื่อ หรือเลขบัตร 13 หลัก..." />
        </div>
        <div class="queue-list" id="todayQueueList">
          <div class="muted">กำลังโหลดคิวจาก JHCIS...</div>
        </div>
      </div>

      <div class="card">
        <div id="staffAlertBanner" class="alert-banner" style="display:none;"></div>

        <div style="padding:14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--border);margin-bottom:14px;">
          <div class="grid-3" style="align-items:end;">
            <div class="field" style="margin-bottom:0;">
              <label for="staffCidInput">เลขบัตรประชาชนผู้ป่วย (13 หลัก)</label>
              <input type="text" id="staffCidInput" maxlength="13" placeholder="กรอกเลขบัตร 13 หลัก" style="font-weight:700;letter-spacing:0.8px;" />
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-blue" id="btnStaffSearchCid">
                <i class="fa-solid fa-magnifying-glass"></i> ค้นหาผู้ป่วย
              </button>
              <button type="button" class="btn btn-outline" id="btnStaffReadCard">
                <i class="fa-solid fa-id-card"></i> อ่านบัตร
              </button>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <span class="pill pill-role" id="visitModeBadge">โหมด: สร้าง Visit ใหม่</span>
            </div>
          </div>
        </div>

        <div id="patientSummaryBar" class="alert-banner alert-green" style="display:none;"></div>
        <div id="allergyWarningBar" class="alert-banner alert-red" style="display:none;"></div>

        <div class="tabs" id="staffTabs">
          <button type="button" class="tab-btn active" data-tab="vitals">1. ซักประวัติ &amp; สัญญาณชีพ</button>
          <button type="button" class="tab-btn" data-tab="dxrx">2. ICD-10 &amp; สั่งยา/หัตถการ</button>
          <button type="button" class="tab-btn" data-tab="special">3. DTX / SpecialPP / เด็ก 0-60ด.</button>
          <button type="button" class="tab-btn" data-tab="history">4. ประวัติย้อนหลัง</button>
          <button type="button" class="tab-btn" data-tab="ai_tele">5. AI &amp; Telemedicine</button>
        </div>

        <div class="staff-tab-panel" data-panel="vitals">
          <div class="grid-2" style="margin-bottom:14px;">
            <div class="field" style="margin-bottom:0;">
              <label for="stSymptoms">อาการสำคัญ (CC / symptoms)</label>
              <input type="text" id="stSymptoms" placeholder="เช่น ปวดเมื่อยกล้ามเนื้อ / ตรวจติดตามอาการ" />
              <div class="preset-chips">
                ${ccPresets.map((p) => {
                  const val = p.content || p.text || '';
                  return `<button type="button" class="chip" data-fill-target="stSymptoms" data-fill-text="${escAttr(val)}">${esc(p.label || val)}</button>`;
                }).join('')}
              </div>
            </div>
            <div class="field" style="margin-bottom:0;">
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

          <div class="mhs-bento-vitals" style="margin-bottom:14px;">
            <div class="mhs-vital-card"><label for="stWeight"><span>น้ำหนัก</span><span>kg</span></label><input type="number" step="0.1" id="stWeight" placeholder="0.0" /></div>
            <div class="mhs-vital-card"><label for="stHeight"><span>ส่วนสูง</span><span>cm</span></label><input type="number" step="0.1" id="stHeight" placeholder="0.0" /></div>
            <div class="mhs-vital-card"><label for="stPressure"><span>ความดัน</span><span>mmHg</span></label><input type="text" id="stPressure" placeholder="120/80" /></div>
            <div class="mhs-vital-card"><label for="stPulse"><span>ชีพจร</span><span>bpm</span></label><input type="number" id="stPulse" placeholder="75" /></div>
            <div class="mhs-vital-card"><label for="stTemp"><span>อุณหภูมิ</span><span>°C</span></label><input type="number" step="0.1" id="stTemp" placeholder="36.5" /></div>
            <div class="mhs-vital-card"><label for="stWaist"><span>รอบเอว</span><span>cm</span></label><input type="number" step="0.1" id="stWaist" placeholder="80" /></div>
            <div class="field" style="margin:0;">
              <label for="stTimeService">ช่วงเวลาบริการ</label>
              <select id="stTimeService">
                <option value="1">1 = ในเวลาราชการ</option>
                <option value="2">2 = นอกเวลาราชการ</option>
              </select>
            </div>
            <div class="field" style="margin:0;">
              <label for="stDiagNote">บันทึกแพทย์/เจ้าหน้าที่ (diagnote)</label>
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

        <div class="staff-tab-panel" data-panel="dxrx" style="display:none;">
          <datalist id="dosePresetsList">
            ${dosePresets.map((p) => `<option value="${escAttr(p.content || p.text || '')}">${esc(p.label || '')}</option>`).join('')}
          </datalist>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
            <button type="button" class="btn btn-blue btn-sm" id="btnReMed">
              <i class="fa-solid fa-rotate-left"></i> Re Med. (ดึงยา/โรคครั้งล่าสุด)
            </button>
            <span class="muted" id="reMedInfo"></span>
          </div>

          <div class="grid-2">
            <div style="padding:14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--border);">
              <label style="font-weight:700;font-size:13.5px;display:block;margin-bottom:8px;">ค้นหารหัสโรค ICD-10</label>
              <div style="display:flex;gap:6px;margin-bottom:8px;">
                <input type="text" id="icdSearchInput" placeholder="พิมพ์รหัสหรือชื่อโรค เช่น I10, J06" />
                <button type="button" class="btn btn-outline btn-sm" id="btnSearchIcd">ค้นหา</button>
              </div>
              <div id="icdSearchResults" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);background:#fff;border-radius:12px;padding:6px;margin-bottom:12px;"></div>

              <strong style="font-size:13.5px;">รายการ ICD-10 ที่เลือก</strong>
              <table>
                <thead><tr><th>รหัส</th><th>DxType</th><th>วันนัด</th><th>ลบ</th></tr></thead>
                <tbody id="selectedIcdBody"><tr><td colspan="4" class="muted">ยังไม่ได้เลือกรหัส ICD-10</td></tr></tbody>
              </table>
            </div>

            <div style="padding:14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--border);">
              <label style="font-weight:700;font-size:13.5px;display:block;margin-bottom:8px;">ค้นหายา / สมุนไพร / หัตถการ</label>
              <div style="display:flex;gap:6px;margin-bottom:8px;">
                <select id="drugCategorySelect" style="width:130px;flex-shrink:0;">
                  <option value="all">ทั้งหมด</option>
                  <option value="herb">สมุนไพร (10)</option>
                  <option value="service">หัตถการ (02,03)</option>
                  <option value="dental">ทันตกรรม (06,02)</option>
                  <option value="adp">ADP (11)</option>
                </select>
                <input type="text" id="drugSearchInput" placeholder="พิมพ์ชื่อยา/สมุนไพร/หัตถการ" />
                <button type="button" class="btn btn-outline btn-sm" id="btnSearchDrug">ค้นหา</button>
              </div>
              <div id="drugSearchResults" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);background:#fff;border-radius:12px;padding:6px;margin-bottom:12px;"></div>

              <strong style="font-size:13.5px;">รายการยา / สมุนไพร / หัตถการ ที่สั่ง</strong>
              <table>
                <thead><tr><th>รายการ</th><th>จำนวน (Stepper)</th><th>วิธีใช้</th><th>ลบ</th></tr></thead>
                <tbody id="selectedDrugBody"><tr><td colspan="4" class="muted">ยังไม่มีรายการยา/สมุนไพร/หัตถการ</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="staff-tab-panel" data-panel="special" style="display:none;">
          <div class="grid-3">
            <div class="field"><label>น้ำตาล DTX (mg/dL)</label><input type="number" step="0.1" id="stSugar" /></div>
            <div class="field"><label>สถานะการอดอาหาร</label><input type="text" id="stSugarFasting" placeholder="เช่น NPO / หลังอาหาร 2 ชม." /></div>
            <div class="field"><label>อายุเป็นเดือน (เด็ก 0-60ด.)</label><input type="number" id="stAgeMonths" placeholder="คำนวณอัตโนมัติจากคนไข้" /></div>
          </div>

          <div class="grid-2" style="margin-top:8px;">
            <div class="card" style="padding:14px !important;background:var(--surface-2) !important;">
              <strong>SpecialPP: บุหรี่ &amp; สุรา</strong>
              <div class="field" style="margin-top:10px;">
                <label>สถานะการสูบบุหรี่</label>
                <select id="stSmokeStatus">
                  <option value="">-- ไม่ระบุ --</option>
                  <option value="ไม่สูบ">ไม่สูบ (1B52)</option>
                  <option value="เคยสูบแต่เลิกแล้ว">เคยสูบแต่เลิกแล้ว (1B51)</option>
                  <option value="ยังสูบอยู่">ยังสูบอยู่</option>
                </select>
              </div>
              <div class="field" style="margin-bottom:0;">
                <label>สถานะการดื่มสุรา</label>
                <select id="stAlcoholStatus">
                  <option value="">-- ไม่ระบุ --</option>
                  <option value="ไม่ดื่ม">ไม่ดื่ม (1B600)</option>
                  <option value="เคยดื่มแต่เลิกแล้ว">เคยดื่มแต่เลิกแล้ว (1B601)</option>
                  <option value="ยังดื่มอยู่">ยังดื่มอยู่</option>
                </select>
              </div>
            </div>

            <div class="card" style="padding:14px !important;background:var(--surface-2) !important;">
              <strong>โภชนาการเด็ก 0-60 เดือน (visitnutrition)</strong>
              <div class="grid-2" style="margin-top:10px;">
                <div class="field"><label>รอบศีรษะ (cm)</label><input type="number" step="0.1" id="stHeadCircum" /></div>
                <div class="field">
                  <label>ระดับโภชนาการ (nlevel)</label>
                  <select id="stNlevel">
                    <option value="3
