/**
 * Rbac.gs — Object-Level Role-Based Access Control (ditegakkan di server).
 *
 * Aturan:
 *  - Admin  : akses penuh (termasuk soft delete, restore, impor GEDCOM, panel admin).
 *  - User   : hanya boleh menambah/mengubah:
 *      (a) profil miliknya sendiri (id_anggota yang tertaut ke akunnya),
 *      (b) pasangannya di Data_Pernikahan (status Aktif/Wafat),
 *      (c) anak kandung/angkatnya (id_ayah atau id_ibu = dirinya).
 *    User DILARANG mengubah id_ayah/id_ibu milik profil lain. Satu-satunya
 *    perubahan garis keturunan yang diizinkan adalah pada profil anaknya
 *    sendiri, dengan syarat ia tetap menjadi orang tua dan orang tua lainnya
 *    adalah pasangannya (atau kosong).
 *  - Setiap pelanggaran → 403 Forbidden generik (tanpa alasan rinci).
 */

function rbacIsAdmin_(ctx) {
  return !!(ctx && ctx.user && ctx.user.role === 'Admin');
}

function rbacRequireAdmin_(ctx) {
  if (!rbacIsAdmin_(ctx)) throw ERR.forbidden();
}

/** id_anggota milik user (hanya bila profilnya ada & tidak terhapus). */
function rbacMyAnggotaId_(ctx, idx) {
  var id = ctx && ctx.user ? ctx.user.id_anggota : '';
  if (!id) return null;
  var a = idx.anggotaById[id];
  return a && !a.is_deleted ? id : null;
}

/** Pasangan yang boleh diedit user (status Aktif/Wafat, tidak terhapus). */
function rbacSpouseIds_(meId, idx) {
  var out = [];
  idx.pernikahan.forEach(function (m) {
    if (m.is_deleted || m.status_pernikahan === 'Cerai') return;
    if (m.id_suami === meId) out.push(m.id_istri);
    else if (m.id_istri === meId) out.push(m.id_suami);
  });
  return out.filter(function (id) { var a = idx.anggotaById[id]; return a && !a.is_deleted; });
}

function rbacChildIds_(meId, idx) {
  return idx.anggota
    .filter(function (a) { return !a.is_deleted && (a.id_ayah === meId || a.id_ibu === meId); })
    .map(function (a) { return a.id_anggota; });
}

/** Ada pernikahan (tidak terhapus, status apa pun) antara a dan b? */
function rbacIsMarried_(a, b, idx) {
  return idx.pernikahan.some(function (m) {
    return !m.is_deleted && ((m.id_suami === a && m.id_istri === b) || (m.id_suami === b && m.id_istri === a));
  });
}

/** Himpunan id_anggota yang boleh diedit user (self + pasangan + anak). */
function rbacEditableSet_(ctx, idx) {
  var set = {};
  var me = rbacMyAnggotaId_(ctx, idx);
  if (!me) return set;
  set[me] = 'SELF';
  rbacSpouseIds_(me, idx).forEach(function (id) { if (!set[id]) set[id] = 'PASANGAN'; });
  rbacChildIds_(me, idx).forEach(function (id) { if (!set[id]) set[id] = 'ANAK'; });
  return set;
}

function rbacAssertCanEditAnggota_(ctx, targetId, idx) {
  if (rbacIsAdmin_(ctx)) return;
  if (!rbacEditableSet_(ctx, idx)[targetId]) throw ERR.forbidden();
}

/**
 * Membuat anggota baru. User hanya boleh:
 *  - menambah PASANGAN untuk dirinya sendiri (tanpa mengisi orang tua pasangan), atau
 *  - menambah ANAK dengan dirinya sebagai ayah/ibu, dan orang tua lain = pasangannya/kosong.
 */
function rbacAssertCanCreateAnggota_(ctx, record, relasi, idx) {
  if (rbacIsAdmin_(ctx)) return;
  var me = rbacMyAnggotaId_(ctx, idx);
  if (!me) throw ERR.forbidden();

  if (relasi) {
    if (relasi.jenis !== 'PASANGAN' || relasi.id_pasangan !== me) throw ERR.forbidden();
    if (record.id_ayah || record.id_ibu || record.id_pernikahan_ortu) throw ERR.forbidden();
    return;
  }
  rbacAssertChildLineage_(me, record, idx);
}

/** Validasi bahwa garis keturunan sebuah anak tetap di bawah kendali user. */
function rbacAssertChildLineage_(me, lineage, idx) {
  var ayah = lineage.id_ayah || '';
  var ibu = lineage.id_ibu || '';
  if (ayah !== me && ibu !== me) throw ERR.forbidden();
  var other = ayah === me ? ibu : ayah;
  if (other && !rbacIsMarried_(me, other, idx)) throw ERR.forbidden();
  if (lineage.id_pernikahan_ortu) {
    var m = idx.pernikahanById[lineage.id_pernikahan_ortu];
    if (!m || m.is_deleted || (m.id_suami !== me && m.id_istri !== me)) throw ERR.forbidden();
  }
}

/** Perubahan id_ayah/id_ibu/id_pernikahan_ortu pada profil yang SUDAH ada. */
function rbacAssertLineageChange_(ctx, before, after, idx) {
  if (rbacIsAdmin_(ctx)) return;
  var unchanged = LINEAGE_FIELDS.every(function (f) { return (before[f] || '') === (after[f] || ''); });
  if (unchanged) return;
  var me = rbacMyAnggotaId_(ctx, idx);
  if (!me) throw ERR.forbidden();
  // Hanya profil anak milik user sendiri (bukan diri sendiri, bukan pasangan).
  if (before.id_anggota === me) throw ERR.forbidden();
  if (before.id_ayah !== me && before.id_ibu !== me) throw ERR.forbidden();
  rbacAssertChildLineage_(me, after, idx);
}

/** Membuat/mengubah pernikahan: user harus salah satu pihak (sebelum & sesudah). */
function rbacAssertCanWritePernikahan_(ctx, before, after, idx) {
  if (rbacIsAdmin_(ctx)) return;
  var me = rbacMyAnggotaId_(ctx, idx);
  if (!me) throw ERR.forbidden();
  if (before && before.id_suami !== me && before.id_istri !== me) throw ERR.forbidden();
  if (after.id_suami !== me && after.id_istri !== me) throw ERR.forbidden();
  if (before && (before.id_suami !== after.id_suami || before.id_istri !== after.id_istri)) throw ERR.forbidden();
}
