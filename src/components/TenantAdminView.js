export function renderTenantAdminView({ tenantSession, adminPin = '', offlineCount = 0 }) {
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
            <div class="field"><label>ชื่อ-สกุล</label><input type="text" id="newUserName" placeholder="เช่น นายสิรภพ แก้วทิพย์" /></div>
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
              <div class="field"><label>ตำแหน่ง (position)</label><input type="text" id="newUserPosition" placeholder="เช่น แพทย์แผนไทย" /></div>
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
