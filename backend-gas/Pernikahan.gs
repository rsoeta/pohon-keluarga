/**
 * Pernikahan.gs — Data_Pernikahan: mendukung pernikahan lebih dari satu kali
 * (poligami / menikah lagi), status Aktif/Cerai/Wafat, dan soft delete Admin.
 *
 * Pihak pernikahan (id_suami/id_istri) bersifat IMMUTABLE setelah dibuat agar
 * rujukan id_pernikahan_ortu pada anak tidak rusak. Koreksi = hapus + buat ulang (Admin).
 */

function cleanPernikahanInput_(input, isCreate) {
  input = input && typeof input === 'object' ? input : {};
  var out = {};
  var errors = [];
  if (isCreate) {
    out.id_suami = optionalUuidField_(input, 'id_suami', errors);
    out.id_istri = optionalUuidField_(input, 'id_istri', errors);
    if (!out.id_suami) errors.push({ field: 'id_suami', rule: 'required' });
    if (!out.id_istri) errors.push({ field: 'id_istri', rule: 'required' });
  }
  if (isCreate || hasOwn_(input, 'status_pernikahan')) {
    var st = input.status_pernikahan === undefined && isCreate ? 'Aktif' : input.status_pernikahan;
    if (ENUM.STATUS_PERNIKAHAN.indexOf(st) === -1) errors.push({ field: 'status_pernikahan', rule: 'enum' });
    else out.status_pernikahan = st;
  }
  if (hasOwn_(input, 'urutan_pasangan')) {
    var u = input.urutan_pasangan;
    if (u === '' || u === null) out.urutan_pasangan = null;
    else if (!/^\d{1,2}$/.test(String(u)) || Number(u) < 1) errors.push({ field: 'urutan_pasangan', rule: 'int' });
    else out.urutan_pasangan = Number(u);
  }
  if (errors.length) throw ERR.validation(errors);
  return out;
}

/** Validasi integritas: jenis kelamin, bukan diri sendiri, bukan garis lurus, tanpa duplikat aktif. */
function validatePernikahan_(rec, selfId, idx) {
  var s = idx.anggotaById[rec.id_suami];
  var i = idx.anggotaById[rec.id_istri];
  if (!s || s.is_deleted) throw ERR.validation([{ field: 'id_suami', rule: 'exists' }]);
  if (!i || i.is_deleted) throw ERR.validation([{ field: 'id_istri', rule: 'exists' }]);
  if (rec.id_suami === rec.id_istri) throw ERR.validation([{ field: 'id_istri', rule: 'self' }]);
  if (s.jenis_kelamin !== 'L') throw ERR.validation([{ field: 'id_suami', rule: 'gender' }]);
  if (i.jenis_kelamin !== 'P') throw ERR.validation([{ field: 'id_istri', rule: 'gender' }]);
  if (Nasab.isDescendant(idx.anggota, rec.id_suami, rec.id_istri) ||
      Nasab.isDescendant(idx.anggota, rec.id_istri, rec.id_suami)) {
    throw ERR.conflict('INVALID_MARRIAGE');
  }
  var dup = idx.pernikahan.some(function (m) {
    if (m.is_deleted || m.id_pernikahan === selfId) return false;
    if (m.id_suami !== rec.id_suami || m.id_istri !== rec.id_istri) return false;
    return m.status_pernikahan === 'Aktif' && rec.status_pernikahan === 'Aktif';
  });
  if (dup) throw ERR.conflict('DUPLICATE_MARRIAGE');
}

function autoUrutanPasangan_(rec, idx) {
  var max = 0;
  idx.pernikahan.forEach(function (m) {
    if (!m.is_deleted && m.id_suami === rec.id_suami) max = Math.max(max, Number(m.urutan_pasangan || 0));
  });
  return max + 1;
}

/** Insert internal (dipakai juga oleh Anggota_create_ untuk relasi PASANGAN). */
function pernikahanInsert_(ctx, idx, data) {
  var rec = {
    id_pernikahan: Utilities.getUuid(),
    id_suami: data.id_suami,
    id_istri: data.id_istri,
    status_pernikahan: data.status_pernikahan || 'Aktif',
    urutan_pasangan: data.urutan_pasangan || null,
    is_deleted: false,
    updated_at: nowIso_()
  };
  validatePernikahan_(rec, null, idx);
  if (!rec.urutan_pasangan) rec.urutan_pasangan = autoUrutanPasangan_(rec, idx);
  var row = Db.insert(SHEET.PERNIKAHAN, rec);
  idx.pernikahan.push(row);
  idx.pernikahanById[row.id_pernikahan] = row;
  logActivity_(ctx, 'CREATE', row.id_pernikahan, { entitas: 'pernikahan', id_suami: rec.id_suami, id_istri: rec.id_istri });
  return row;
}

/** payload: { data: { id_suami, id_istri, status_pernikahan, urutan_pasangan } } */
function Pernikahan_create_(ctx, p) {
  var clean = cleanPernikahanInput_(p.data, true);
  var idx = loadIndex_();
  rbacAssertCanWritePernikahan_(ctx, null, clean, idx);
  var row = pernikahanInsert_(ctx, idx, clean);
  return { pernikahan: Db.plain(SHEET.PERNIKAHAN, row) };
}

/** payload: { id_pernikahan, data: { status_pernikahan?, urutan_pasangan? } } */
function Pernikahan_update_(ctx, p) {
  var id = String(p.id_pernikahan || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_pernikahan', rule: 'uuid' }]);
  var idx = loadIndex_();
  var before = idx.pernikahanById[id];
  if (!before || before.is_deleted) throw ERR.notFound();

  var clean = cleanPernikahanInput_(p.data, false);
  var after = Db.plain(SHEET.PERNIKAHAN, before);
  Object.keys(clean).forEach(function (k) { after[k] = clean[k]; });
  rbacAssertCanWritePernikahan_(ctx, before, after, idx);
  validatePernikahan_(after, id, idx);

  var diff = diffFields_(before, after, ['status_pernikahan', 'urutan_pasangan']);
  if (!Object.keys(diff).length) return { pernikahan: Db.plain(SHEET.PERNIKAHAN, before), changed: false };
  var changes = {};
  Object.keys(diff).forEach(function (k) { changes[k] = after[k]; });
  changes.updated_at = nowIso_();
  Db.update(SHEET.PERNIKAHAN, before, changes);
  logActivity_(ctx, 'UPDATE', id, { entitas: 'pernikahan', perubahan: diff });
  return { pernikahan: Db.plain(SHEET.PERNIKAHAN, before), changed: true };
}

function Pernikahan_softDelete_(ctx, p) {
  var id = String(p.id_pernikahan || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_pernikahan', rule: 'uuid' }]);
  var row = Db.findOne(SHEET.PERNIKAHAN, 'id_pernikahan', id);
  if (!row) throw ERR.notFound();
  if (row.is_deleted) return { pernikahan: Db.plain(SHEET.PERNIKAHAN, row), changed: false };
  Db.update(SHEET.PERNIKAHAN, row, { is_deleted: true, updated_at: nowIso_() });
  logActivity_(ctx, 'SOFT_DELETE', id, { entitas: 'pernikahan' });
  return { pernikahan: Db.plain(SHEET.PERNIKAHAN, row), changed: true };
}

function Pernikahan_restore_(ctx, p) {
  var id = String(p.id_pernikahan || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_pernikahan', rule: 'uuid' }]);
  var idx = loadIndex_();
  var row = idx.pernikahanById[id];
  if (!row) throw ERR.notFound();
  if (!row.is_deleted) return { pernikahan: Db.plain(SHEET.PERNIKAHAN, row), changed: false };
  validatePernikahan_(row, id, idx);
  Db.update(SHEET.PERNIKAHAN, row, { is_deleted: false, updated_at: nowIso_() });
  logActivity_(ctx, 'RESTORE', id, { entitas: 'pernikahan' });
  return { pernikahan: Db.plain(SHEET.PERNIKAHAN, row), changed: true };
}
