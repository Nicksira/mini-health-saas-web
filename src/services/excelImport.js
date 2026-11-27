import * as XLSX from 'xlsx';
import { VALID_ROLES } from '../config/constants.js';

function normalizeCid(val) {
  return String(val ?? '').replace(/\D/g, '').trim();
}

function normalizeExcelRoles(rawRole) {
  const tokens = String(rawRole || 'vhv')
    .split(/[,|/;]+/)
    .map((token) => {
      const v = token.trim().toLowerCase();
      if (!v) return '';
      if (v === 'tenant_admin' || v === 'admin' || v.includes('แอดมิน') || v.includes('ผู้ดูแล')) return 'tenant_admin';
      if (v === 'staff' || v.includes('เจ้าหน้าที่') || v.includes('แพทย์') || v.includes('พยาบาล')) return 'staff';
      if (v === 'vhv' || v.includes('อสม')) return 'vhv';
      return v;
    })
    .filter((v) => VALID_ROLES.includes(v));

  const unique = Array.from(new Set(tokens));
  return unique.length ? unique : ['vhv'];
}

export async function parseUsersExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('ไม่พบชีตข้อมูลในไฟล์ Excel');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const users = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const cid = normalizeCid(
      row.cid ?? row.CID ?? row.idcard ?? row['เลขบัตร'] ?? row['เลขประจำตัวประชาชน'] ?? ''
    );
    const fullName = String(
      row.full_name ?? row.name ?? row.fullname ?? row['ชื่อ-สกุล'] ?? row['ชื่อสกุล'] ?? row['ชื่อ'] ?? ''
    ).trim();
    const roleRaw = row.role ?? row.roles ?? row['บทบาท'] ?? row['สิทธิ์'] ?? 'vhv';
    const position = String(row.position ?? row['ตำแหน่ง'] ?? '').trim();
    const villageNo = String(row.village_no ?? row.moo ?? row['หมู่'] ?? row['หมู่ที่'] ?? '').trim();
    const phone = String(row.phone ?? row.tel ?? row['เบอร์โทร'] ?? row['โทรศัพท์'] ?? '').trim();

    if (!cid && !fullName) return;

    if (!/^\d{13}$/.test(cid)) {
      errors.push(`แถวที่ ${rowNum}: เลขบัตรประชาชนไม่ครบ 13 หลัก (${cid || 'ว่าง'})`);
      return;
    }
    if (!fullName) {
      errors.push(`แถวที่ ${rowNum}: ไม่ระบุชื่อบุคลากร`);
      return;
    }

    const roles = normalizeExcelRoles(roleRaw);
    users.push({
      cid,
      full_name: fullName,
      name: fullName,
      role: roles.join(','),
      roles,
      position,
      village_no: villageNo,
      phone
    });
  });

  return { users, errors };
}
