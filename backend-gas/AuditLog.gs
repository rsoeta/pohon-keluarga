/**
 * AuditLog.gs — Pencatatan aktivitas ke sheet Log_Aktivitas.
 * Detail disimpan sebagai JSON (tanpa password/token). Wajib dipanggil di
 * dalam withScriptLock_ (bagian dari operasi tulis).
 */
function logActivity_(ctx, aksi, targetId, detail) {
  if (ENUM.AKSI_LOG.indexOf(aksi) === -1) throw new Error('Aksi log tidak dikenal: ' + aksi);
  var json = '';
  try {
    json = JSON.stringify(detail || {});
  } catch (e) {
    json = '{}';
  }
  if (json.length > APP.LOG_DETAIL_MAX_CHARS) {
    json = JSON.stringify({ terpotong: true, ringkasan: json.substring(0, APP.LOG_DETAIL_MAX_CHARS - 100) });
  }
  Db.insert(SHEET.LOG, {
    id_log: Utilities.getUuid(),
    timestamp: nowIso_(),
    id_user: ctx && ctx.user ? ctx.user.id_user : 'SYSTEM',
    aksi: aksi,
    target_id: targetId || '',
    detail: json
  });
}

/** Diff sederhana untuk log UPDATE: { field: [lama, baru] }. */
function diffFields_(before, after, fields) {
  var d = {};
  fields.forEach(function (f) {
    var a = before[f] === undefined ? null : before[f];
    var b = after[f] === undefined ? null : after[f];
    if (a !== b) d[f] = [a, b];
  });
  return d;
}
