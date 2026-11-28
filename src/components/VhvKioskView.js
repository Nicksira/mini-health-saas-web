export function renderVhvKioskView({ vhvUser, tenantSession = null, offlineCount = 0 }) {
  const openGuideJs = (title, gif, desc) =>
    `const d=document.getElementById('mhsGuideDialog');` +
    `document.getElementById('mhsGuideTitle').textContent='${title}';` +
    `document.getElementById('mhsGuideImg').src='${gif}';` +
    `document.getElementById('mhsGuideDesc').textContent='${desc}';` +
    `if(d&&d.showModal)d.showModal();`;

  const calcBmiJs =
    `const w=parseFloat(document.getElementById('kioskWeight')?.value);` +
    `const h=parseFloat(document.getElementById('kioskHeight')?.value)/100;` +
    `const b=document.getElementById('kioskBmiLive');` +
    `if(b){b.textContent=(w>0&&h>0)?'BMI '+(w/(h*h)).toFixed(1):'BMI --';}`;

  const hospTitle = tenantSession?.hosp_name
    ? `${tenantSession.hosp_name} [${tenantSession.hospcode || ''}]`
    : 'โรงพยาบาลส่งเสริมสุขภาพตำบล';

  return `
    <div class="mhs-kiosk-shell">
      <!-- หัวเว็บ Kiosk สไตล์ต้นฉบับ (โลโก้ + Mini Health Station + ปุ่ม อสม.) -->
      <div class="mhs-kiosk-header">
        <img src="/TK.png" alt="โลโก้หน่วยงาน" class="mhs-kiosk-logo" onerror="this.style.display='none'" />
        <h1 class="mhs-aurora-title">Mini Health Station</h1>
        <div class="mhs-kiosk-hosp" id="kioskHospLabel">${esc(hospTitle)}</div>

        <div class="mhs-vhv-bar">
          <span><i class="fa-solid fa-user-nurse"></i> อสม.: ${esc(vhvUser.full_name || vhvUser.name)}</span>
          <span id="kioskOfflinePill" style="background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:999px;font-size:12px;">
            ค้างส่ง: ${offlineCount}
          </span>
          <button type="button" id="btnSyncOfflineNow" style="background:#FFFFFF;color:#4F46E5;">ซิงก์คิว</button>
          <button type="button" id="btnVhvLogout" style="background:#EF4444;color:#FFFFFF;">ออก</button>
        </div>
      </div>

      <!-- แถบแจ้งเตือน (มองเห็นได้ทั้งหน้า 1 และหน้า 2) -->
      <div id="kioskAlert" class="alert-banner" style="display:none;margin:12px 18px 0;"></div>

      <!-- ==================== SCREEN 1: หน้าจอรอสอดบัตร (เหมือนหน้าต้นฉบับ) ==================== -->
      <div id="mhsKioskStandby" class="mhs-standby-stage">
        <video class="mhs-standby-video" autoplay loop muted playsinline>
          <source src="/bg-video.mp4" type="video/mp4" />
        </video>

        <div class="mhs-standby-content">
          <button type="button" class="mhs-nick-trigger" onclick="document.getElementById('btnKioskReadCard')?.click()" title="แตะเพื่ออ่านบัตรประชาชน (8189)">
            <img src="/nick.png" alt="กรุณาสอดบัตรประชาชน" />
          </button>

          <h2 class="mhs-standby-title">กรุณาสอดบัตรประชาชน เพื่อเข้ารับบริการ</h2>

          <div class="mhs-standby-actions">
            <button type="button" class="btn btn-cyan" style="padding:13px 32px;font-size:16px;" onclick="document.getElementById('mhsCidDialog')?.showModal();document.getElementById('mhsModalCidInput')?.focus();">
              ไม่มีบัตรประชาชนแตะที่ปุ่มนี้
            </button>
            <button type="button" class="btn btn-outline" style="border-radius:999px !important;padding:12px 22px;" onclick="window.__mhsSetKioskScreen?.('dashboard')">
              <i class="fa-solid fa-pen-to-square"></i> เปิดหน้ากรอกค่าวัด
            </button>
          </div>
        </div>
      </div>

      <!-- ==================== SCREEN 2: หน้าจอคัดกรองและกรอกสัญญาณชีพ ==================== -->
      <div id="mhsKioskDashboard" class="mhs-kiosk-dash" style="display:none;">
        <div class="mhs-patient-gradient">
          <button type="button" class="btn btn-outline btn-sm" style="position:absolute;top:14px;left:14px;border-radius:999px !important;" onclick="window.__mhsSetKioskScreen?.('standby')">
            <i class="fa-solid fa-chevron-left"></i> กลับหน้าสอดบัตร
          </button>
          <h2 style="margin:4px 0 0;font-size:24px;font-weight:700;">ข้อมูลผู้รับบริการ &amp; ตรวจวัดสัญญาณชีพ</h2>
          <div class="mhs-clock-pill" id="kioskLiveClock">กำลังโหลดเวลา...</div>
        </div>

        <div id="kioskPatientCard" class="alert-banner alert-green" style="display:none;"></div>

        <!-- ค้นหา / อ่านบัตร / เลือกประเภทคัดกรอง -->
        <div class="card" style="margin-bottom:16px;">
          <div class="grid-3" style="align-items:end;">
            <div class="field" style="margin-bottom:0;">
              <label for="kioskCid">เลขบัตรประชาชนผู้รับบริการ (13 หลัก)</label>
              <input type="text" id="kioskCid" maxlength="13" placeholder="กรอกเลขบัตร 13 หลัก" style="font-weight:700;letter-spacing:1px;" />
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" id="btnKioskLookup"><i class="fa-solid fa-magnifying-glass"></i> ค้นหา</button>
              <button type="button" class="btn btn-outline" id="btnKioskReadCard"><i class="fa-solid fa-id-card"></i> อ่านบัตร (8189)</button>
            </div>
            <div class="field" style="margin-bottom:0;">
              <label for="kioskServiceType">ประเภทการคัดกรอง</label>
              <select id="kioskServiceType">
                <option value="ncd">คัดกรอง NCD / ติดตามกลุ่มสีเขียว</option>
                <option value="screening">คัดกรอง DM/HT อายุ 35 ปีขึ้นไป</option>
                <option value="child">ตรวจภาวะโภชนาการเด็ก 0-60 เดือน</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 5 ปุ่มอุปกรณ์พร้อมภาพสาธิต GIF -->
        <div class="mhs-guide-strip">
          <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีวัดความดันโลหิต', '/guide-bp.gif', 'นั่งพัก 5 นาที หลังพิงพนักพิง เท้าวางราบไม่ไขว่ห้าง วางแขนระดับหัวใจ และไม่พูดคุยขณะวัด')}">
            <div class="mhs-guide-ico" style="background:#EFF6FF;color:#2563EB;"><i class="fa-solid fa-gauge-high"></i></div>
            <strong>วัดความดันฯ</strong>
          </button>
          <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีวัดออกซิเจนปลายนิ้ว', '/guide-o2.gif', 'สอดนิ้วชี้ให้สุด วางมือและแขนนิ่งบนโต๊ะระดับอก รอตัวเลข %SpO2 นิ่งก่อนอ่านค่า')}">
            <div class="mhs-guide-ico" style="background:#FEFCE8;color:#CA8A04;"><i class="fa-solid fa-hand-holding-heart"></i></div>
            <strong>ออกซิเจนปลายนิ้ว</strong>
          </button>
          <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีชั่งน้ำหนัก', '/guide-weight.gif', 'ถอดรองเท้าและเสื้อผ้าหนัก ยืนตัวตรงเต็มฝ่าเท้าทั้งสองข้างบนเครื่องชั่ง')}">
            <div class="mhs-guide-ico" style="background:#ECFDF5;color:#059669;"><i class="fa-solid fa-weight-scale"></i></div>
            <strong>ชั่งน้ำหนัก</strong>
          </button>
          <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีวัดอุณหภูมิ', '/guide-temp.gif', 'เช็ดหน้าผากให้สะอาดและแห้ง จ่อเครื่องวัดห่างจากหน้าผากประมาณ 3 ซม.')}">
            <div class="mhs-guide-ico" style="background:#FFF7ED;color:#EA580C;"><i class="fa-solid fa-temperature-half"></i></div>
            <strong>วัดอุณหภูมิ</strong>
          </button>
          <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีตรวจน้ำตาลปลายนิ้ว (DTX)', '/guide-sugar.gif', 'ล้างมือให้สะอาดและเช็ดให้แห้ง เปลี่ยนเข็มใหม่ทุกครั้ง เจาะด้านข้างปลายนิ้ว')}">
            <div class="mhs-guide-ico" style="background:#FEF2F2;color:#DC2626;"><i class="fa-solid fa-droplet"></i></div>
            <strong>น้ำตาลปลายนิ้ว</strong>
          </button>
        </div>

        <!-- Bento Grid กรอกค่าสัญญาณชีพ -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <strong style="font-size:16px;"><i class="fa-solid fa-heart-pulse" style="color:#007AFF;margin-right:6px;"></i>บันทึกค่าสัญญาณชีพ</strong>
            <span class="pill pill-role" id="kioskBmiLive">BMI --</span>
          </div>

          <div class="mhs-bento-vitals">
            <div class="mhs-vital-card"><label for="kioskWeight"><span>น้ำหนัก</span><span>kg</span></label><input type="number" step="0.1" id="kioskWeight" placeholder="0.0" oninput="${calcBmiJs}" /></div>
            <div class="mhs-vital-card"><label for="kioskHeight"><span>ส่วนสูง</span><span>cm</span></label><input type="number" step="0.1" id="kioskHeight" placeholder="0.0" oninput="${calcBmiJs}" /></div>
            <div class="mhs-vital-card"><label for="kioskPressure"><span>ความดัน</span><span>mmHg</span></label><input type="text" id="kioskPressure" placeholder="120/80" /></div>
            <div class="mhs-vital-card"><label for="kioskPulse"><span>ชีพจร</span><span>bpm</span></label><input type="number" id="kioskPulse" placeholder="75" /></div>
            <div class="mhs-vital-card"><label for="kioskTemp"><span>อุณหภูมิ</span><span>°C</span></label><input type="number" step="0.1" id="kioskTemp" placeholder="36.5" /></div>
            <div class="mhs-vital-card"><label for="kioskWaist"><span>รอบเอว</span><span>cm</span></label><input type="number" step="0.1" id="kioskWaist" placeholder="80" /></div>
            <div class="mhs-vital-card"><label for="kioskSugar"><span>น้ำตาล DTX</span><span>mg/dL</span></label><input type="number" step="0.1" id="kioskSugar" placeholder="--" /></div>
            <div class="mhs-vital-card"><label for="kioskAgeMonths"><span>อายุเด็ก</span><span>เดือน</span></label><input type="number" id="kioskAgeMonths" placeholder="0-60" /></div>
          </div>

          <!-- ความพึงพอใจ 5 ดาว -->
          <div style="margin-top:16px;padding:14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--border);">
            <label style="margin-bottom:8px;display:block;font-size:13px;font-weight:700;">ประเมินความพึงพอใจการรับบริการ (1 - 5 ดาว)</label>
            <div class="stars" id="ratingStars">
              ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn ${n === 5 ? 'selected' : ''}" data-score="${n}">${'★'.repeat(n)} (${n})</button>`).join('')}
            </div>
          </div>

          <div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-outline" onclick="window.__mhsSetKioskScreen?.('standby')">กลับหน้าสอดบัตร</button>
            <button type="button" class="btn btn-green" style="padding:14px 30px;font-size:16px;min-width:240px;" id="btnSubmitKiosk">
              <i class="fa-solid fa-cloud-arrow-up"></i> บันทึกข้อมูลคัดกรองลง JHCIS
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: กรอกเลข 13 หลัก (เมื่อแตะปุ่ม ไม่มีบัตรประชาชนแตะที่ปุ่มนี้) -->
    <dialog id="mhsCidDialog" class="mhs-dialog" onclick="if(event.target===this)this.close()">
      <div style="width:62px;height:62px;border-radius:18px;background:#EFF6FF;color:#007AFF;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px;">
        <i class="fa-solid fa-id-card"></i>
      </div>
      <h3 style="margin:0 0 6px;font-size:21px;">ค้นหาประวัติผู้รับบริการ</h3>
      <p class="muted" style="margin:0 0 16px;">กรุณากรอกเลขประจำตัวประชาชน 13 หลัก</p>
      <input
        type="tel"
        id="mhsModalCidInput"
        maxlength="13"
        placeholder="●●●●●●●●●●●●●"
        style="text-align:center;font-size:24px;font-weight:700;letter-spacing:2px;padding:14px;margin-bottom:16px;"
        oninput="this.value=this.value.replace(/[^0-9]/g,'')"
        onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('mhsModalCidConfirm')?.click();}"
      />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button type="button" class="btn btn-outline" onclick="document.getElementById('mhsCidDialog')?.close()">ยกเลิก</button>
        <button
          type="button"
          id="mhsModalCidConfirm"
          class="btn btn-primary"
          onclick="const v=(document.getElementById('mhsModalCidInput')?.value||'').trim();const inp=document.getElementById('kioskCid');if(inp)inp.value=v;document.getElementById('mhsCidDialog')?.close();window.__mhsSetKioskScreen?.('dashboard');if(v.length===13)document.getElementById('btnKioskLookup')?.click();"
        >
          ยืนยันและค้นหา
        </button>
      </div>
    </dialog>

    <!-- Modal: แสดงภาพสาธิตวิธีวัด (GIF) -->
    <dialog id="mhsGuideDialog" class="mhs-dialog" onclick="if(event.target===this)this.close()">
      <h3 id="mhsGuideTitle" style="margin:0;font-size:20px;">วิธีตรวจวัด</h3>
      <div class="mhs-dialog-media">
        <img id="mhsGuideImg" src="/guide-bp.gif" alt="วิธีตรวจวัด" />
      </div>
      <p id="mhsGuideDesc" style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.6;"></p>
      <button type="button" class="btn btn-primary" style="width:100%;padding:12px;" onclick="document.getElementById('mhsGuideDialog')?.close()">
        เข้าใจแล้ว · ปิดหน้าต่าง
      </button>
    </dialog>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
