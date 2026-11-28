export function renderVhvKioskView({ vhvUser, offlineCount = 0 }) {
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

  return `
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
        <div>
          <h2 class="card-title" style="margin:0;font-size:21px;">
            <span><i class="fa-solid fa-heart-pulse" style="color:#0D9488;margin-right:8px;"></i>โหมด อสม. คัดกรองสุขภาพ (Kiosk)</span>
          </h2>
          <span class="muted">ผู้ปฏิบัติงาน: <strong>${esc(vhvUser.full_name || vhvUser.name)}</strong> (${esc(vhvUser.cid)})</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="pill ${offlineCount > 0 ? 'pill-warn' : 'pill-online'}" id="kioskOfflinePill">
            คิวค้างส่ง: ${offlineCount} รายการ
          </span>
          <button type="button" class="btn btn-blue btn-sm" id="btnSyncOfflineNow">
            <i class="fa-solid fa-rotate"></i> ซิงก์คิวค้างส่งทันที
          </button>
          <button type="button" class="btn btn-outline btn-sm" id="btnVhvLogout">
            <i class="fa-solid fa-right-from-bracket"></i> ออกจากระบบ อสม.
          </button>
        </div>
      </div>

      <div id="kioskAlert" class="alert-banner" style="display:none;"></div>

      <div class="mhs-kiosk-hero">
        <button type="button" class="mhs-smartcard-btn" onclick="document.getElementById('btnKioskReadCard')?.click()" title="แตะเพื่ออ่านบัตรประชาชน">
          <img src="/nick.png" alt="สอดบัตรประชาชน" onerror="this.style.display='none'" />
          <span><i class="fa-solid fa-id-card"></i> แตะอ่านบัตร (8189)</span>
        </button>

        <div>
          <div class="grid-2" style="align-items:end;">
            <div class="field" style="margin-bottom:0;">
              <label for="kioskCid">เลขบัตรประชาชนผู้รับบริการ (13 หลัก)</label>
              <input type="text" id="kioskCid" maxlength="13" placeholder="กรอกเลขบัตร 13 หลัก หรือสอดบัตร" style="font-size:17px;font-weight:700;letter-spacing:1px;" />
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

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;">
            <button type="button" class="btn btn-blue" id="btnKioskLookup">
              <i class="fa-solid fa-magnifying-glass"></i> ค้นหาผู้รับบริการ
            </button>
            <button type="button" class="btn btn-outline" id="btnKioskReadCard">
              <i class="fa-solid fa-address-card"></i> อ่านบัตร (8189)
            </button>
            <span class="pill pill-role" id="kioskBmiLive" style="margin-left:auto;">BMI --</span>
          </div>
        </div>
      </div>

      <div id="kioskPatientCard" class="alert-banner alert-green" style="display:none;"></div>

      <div style="font-size:13px;font-weight:700;color:#475569;margin-bottom:8px;">
        <i class="fa-solid fa-circle-play" style="color:#007AFF;margin-right:5px;"></i>แตะดูภาพวิธีตรวจวัดที่ถูกต้อง
      </div>
      <div class="mhs-guide-strip">
        <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีวัดความดันโลหิตที่ถูกต้อง', '/guide-bp.gif', 'นั่งพัก 5 นาที หลังพิงพนักพิง เท้าวางราบไม่ไขว่ห้าง วางแขนระดับหัวใจ และไม่พูดคุยขณะวัด')}">
          <div class="mhs-guide-ico" style="background:#EFF6FF;color:#2563EB;"><i class="fa-solid fa-gauge-high"></i></div>
          <strong>วัดความดันฯ</strong>
          <small>ดูวิธีวัด</small>
        </button>
        <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีวัดออกซิเจนปลายนิ้ว', '/guide-o2.gif', 'สอดนิ้วชี้เข้าไปให้สุด วางมือและแขนนิ่งบนโต๊ะระดับอก รอตัวเลข %SpO2 นิ่งก่อนอ่านค่า')}">
          <div class="mhs-guide-ico" style="background:#FEFCE8;color:#CA8A04;"><i class="fa-solid fa-hand-holding-heart"></i></div>
          <strong>ออกซิเจนปลายนิ้ว</strong>
          <small>ดูวิธีวัด</small>
        </button>
        <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีชั่งน้ำหนักที่ถูกต้อง', '/guide-weight.gif', 'ถอดรองเท้าและเสื้อผ้าหนัก ยืนตัวตรงเต็มฝ่าเท้าทั้งสองข้าง มองตรงไปข้างหน้า')}">
          <div class="mhs-guide-ico" style="background:#ECFDF5;color:#059669;"><i class="fa-solid fa-weight-scale"></i></div>
          <strong>ชั่งน้ำหนัก</strong>
          <small>ดูวิธีวัด</small>
        </button>
        <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีวัดอุณหภูมิหน้าผาก', '/guide-temp.gif', 'เช็ดหน้าผากให้สะอาดและแห้ง ไม่มีเหงื่อหรือเส้นผมบัง จ่อเครื่องวัดห่างประมาณ 3 ซม.')}">
          <div class="mhs-guide-ico" style="background:#FFF7ED;color:#EA580C;"><i class="fa-solid fa-temperature-half"></i></div>
          <strong>วัดอุณหภูมิ</strong>
          <small>ดูวิธีวัด</small>
        </button>
        <button type="button" class="mhs-guide-tile" onclick="${openGuideJs('วิธีเจาะน้ำตาลปลายนิ้ว (DTX)', '/guide-sugar.gif', 'ล้างมือให้สะอาดและเช็ดให้แห้ง เปลี่ยนเข็มใหม่ทุกครั้ง เจาะบริเวณด้านข้างปลายนิ้ว')}">
          <div class="mhs-guide-ico" style="background:#FEF2F2;color:#DC2626;"><i class="fa-solid fa-droplet"></i></div>
          <strong>น้ำตาลปลายนิ้ว</strong>
          <small>ดูวิธีวัด</small>
        </button>
      </div>

      <div class="mhs-bento-vitals">
        <div class="mhs-vital-card">
          <label for="kioskWeight"><span>น้ำหนัก</span><span>kg</span></label>
          <input type="number" step="0.1" id="kioskWeight" placeholder="0.0" oninput="${calcBmiJs}" />
        </div>
        <div class="mhs-vital-card">
          <label for="kioskHeight"><span>ส่วนสูง</span><span>cm</span></label>
          <input type="number" step="0.1" id="kioskHeight" placeholder="0.0" oninput="${calcBmiJs}" />
        </div>
        <div class="mhs-vital-card">
          <label for="kioskPressure"><span>ความดันโลหิต</span><span>mmHg</span></label>
          <input type="text" id="kioskPressure" placeholder="120/80" />
        </div>
        <div class="mhs-vital-card">
          <label for="kioskPulse"><span>ชีพจร</span><span>bpm</span></label>
          <input type="number" id="kioskPulse" placeholder="75" />
        </div>
        <div class="mhs-vital-card">
          <label for="kioskTemp"><span>อุณหภูมิ</span><span>°C</span></label>
          <input type="number" step="0.1" id="kioskTemp" placeholder="36.5" />
        </div>
        <div class="mhs-vital-card">
          <label for="kioskWaist"><span>รอบเอว</span><span>cm</span></label>
          <input type="number" step="0.1" id="kioskWaist" placeholder="80" />
        </div>
        <div class="mhs-vital-card">
          <label for="kioskSugar"><span>น้ำตาล DTX</span><span>mg/dL</span></label>
          <input type="number" step="0.1" id="kioskSugar" placeholder="--" />
        </div>
        <div class="mhs-vital-card">
          <label for="kioskAgeMonths"><span>อายุเด็ก</span><span>เดือน</span></label>
          <input type="number" id="kioskAgeMonths" placeholder="0-60" />
        </div>
      </div>

      <div style="margin-top:18px;padding:16px;border-radius:18px;background:var(--surface-2);border:1px solid var(--border);">
        <label style="margin-bottom:10px;display:block;font-size:13px;font-weight:700;color:#334155;">
          <i class="fa-solid fa-star" style="color:#F59E0B;margin-right:6px;"></i>ประเมินความพึงพอใจการรับบริการ (1 - 5 ดาว)
        </label>
        <div class="stars" id="ratingStars">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn ${n === 5 ? 'selected' : ''}" data-score="${n}">${'★'.repeat(n)} (${n})</button>`).join('')}
        </div>
      </div>

      <div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" style="padding:14px 30px;font-size:16px;min-width:240px;" id="btnSubmitKiosk">
          <i class="fa-solid fa-cloud-arrow-up"></i> บันทึกข้อมูลคัดกรองลง JHCIS
        </button>
      </div>
    </div>

    <dialog id="mhsGuideDialog" class="mhs-guide-dialog" onclick="if(event.target===this)this.close()">
      <h3 id="mhsGuideTitle" style="margin:0;font-size:20px;color:#0F172A;">วิธีตรวจวัด</h3>
      <div class="mhs-dialog-media">
        <img id="mhsGuideImg" src="/guide-bp.gif" alt="วิธีตรวจวัด" />
      </div>
      <p id="mhsGuideDesc" style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.6;"></p>
      <button type="button" class="btn btn-primary" style="width:100%;padding:12px;" onclick="document.getElementById('mhsGuideDialog').close()">
        เข้าใจแล้ว · ปิดหน้าต่าง
      </button>
    </dialog>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
