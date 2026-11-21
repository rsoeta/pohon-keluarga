/**
 * DriveUpload.gs — Penyimpanan foto profil privat di Google Drive.
 *
 * Keamanan:
 *  - Validasi tipe MIME dari MAGIC BYTES (JPG/PNG/WebP), bukan sekadar header/ekstensi.
 *  - Maksimum 2MB pasca-kompresi klien (413 jika melebihi).
 *  - Folder Drive tetap privat (tanpa public link sharing); foto diambil
 *    melalui endpoint terautentikasi dengan whitelist file_id terdaftar (anti-IDOR).
 */

var PHOTO_EXT_ = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
});

/** Mendeteksi MIME image nyata dari magic bytes (memakai & 0xff untuk signed byte GAS). */
function detectImageMime_(bytes) {
  if (!bytes || bytes.length < 12) return null;
  var u = function (i) { return bytes[i] & 0xff; };
  if (u(0) === 0xff && u(1) === 0xd8 && u(2) === 0xff) return 'image/jpeg';
  if (u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4e && u(3) === 0x47 &&
      u(4) === 0x0d && u(5) === 0x0a && u(6) === 0x1a && u(7) === 0x0a) {
    return 'image/png';
  }
  if (u(0) === 0x52 && u(1) === 0x49 && u(2) === 0x46 && u(3) === 0x46 &&
      u(8) === 0x57 && u(9) === 0x45 && u(10) === 0x42 && u(11) === 0x50) {
    return 'image/webp';
  }
  return null;
}

function getFotoFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP.FOTO_FOLDER_ID);
  if (!id) throw ERR.unavailable('STORAGE_NOT_CONFIGURED');
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw ERR.unavailable('STORAGE_NOT_CONFIGURED');
  }
}

/** Whitelist foto_file_id yang benar-benar terdaftar pada Data_Anggota (anti-IDOR). */
function allowedFotoIdSet_(ctx) {
  var admin = rbacIsAdmin_(ctx);
  var set = {};
  Db.rows(SHEET.ANGGOTA).forEach(function (a) {
    if (a.foto_file_id && (!a.is_deleted || admin)) set[a.foto_file_id] = true;
  });
  return set;
}

function readDriveFoto_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  var bytes = blob.getBytes();
  var mime = detectImageMime_(bytes) || blob.getContentType() || 'image/jpeg';
  return {
    file_id: fileId,
    mime_type: mime,
    data_url: 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes)
  };
}

/**
 * Handler `foto.upload`: { id_anggota, mime_type, data_base64 }
 * RBAC: hanya Admin atau pemilik/pasangan/orang tua dari profil (via rbacAssertCanEditAnggota_).
 */
function Foto_upload_(ctx, p) {
  var id = String(p.id_anggota || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_anggota', rule: 'uuid' }]);

  var idx = loadIndex_();
  var row = idx.anggotaById[id];
  if (!row || row.is_deleted) throw ERR.notFound();
  rbacAssertCanEditAnggota_(ctx, id, idx);

  var mime = typeof p.mime_type === 'string' ? p.mime_type.trim().toLowerCase() : '';
  if (APP.ALLOWED_PHOTO_MIME.indexOf(mime) === -1) {
    throw ERR.validation([{ field: 'mime_type', rule: 'mime' }]);
  }

  var b64 = typeof p.data_base64 === 'string' ? p.data_base64.trim() : '';
  b64 = b64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').replace(/\s+/g, '');
  if (!b64) throw ERR.validation([{ field: 'data_base64', rule: 'required' }]);
  if (b64.length > 3000000) throw ERR.tooLarge();
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw ERR.validation([{ field: 'data_base64', rule: 'format' }]);
  }

  var bytes = Utilities.base64Decode(b64);
  if (!bytes || !bytes.length) throw ERR.validation([{ field: 'data_base64', rule: 'empty' }]);
  if (bytes.length > APP.MAX_PHOTO_BYTES) throw ERR.tooLarge();

  var detected = detectImageMime_(bytes);
  if (!detected || detected !== mime) {
    throw ERR.validation([{ field: 'file', rule: 'mime' }]);
  }

  var ext = PHOTO_EXT_[detected] || 'jpg';
  var fileName = 'foto_' + id + '_' + Date.now() + '.' + ext;
  var folder = getFotoFolder_();
  var file = folder.createFile(Utilities.newBlob(bytes, detected, fileName));
  var newFileId = file.getId();
  var oldFileId = row.foto_file_id || '';

  Db.update(SHEET.ANGGOTA, row, { foto_file_id: newFileId, updated_at: nowIso_() });
  if (oldFileId && oldFileId !== newFileId) {
    try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (ignore) {}
  }

  logActivity_(ctx, 'UPDATE', id, {
    entitas: 'anggota',
    perubahan: { foto_file_id: [oldFileId, newFileId] }
  });

  return {
    id_anggota: id,
    foto_file_id: newFileId,
    mime_type: detected,
    size: bytes.length
  };
}

/** Handler `foto.remove`: { id_anggota } */
function Foto_remove_(ctx, p) {
  var id = String(p.id_anggota || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_anggota', rule: 'uuid' }]);

  var idx = loadIndex_();
  var row = idx.anggotaById[id];
  if (!row || row.is_deleted) throw ERR.notFound();
  rbacAssertCanEditAnggota_(ctx, id, idx);

  if (!row.foto_file_id) return { id_anggota: id, removed: false };
  var oldFileId = row.foto_file_id;
  Db.update(SHEET.ANGGOTA, row, { foto_file_id: '', updated_at: nowIso_() });
  try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (ignore) {}

  logActivity_(ctx, 'UPDATE', id, {
    entitas: 'anggota',
    perubahan: { foto_file_id: [oldFileId, ''] }
  });
  return { id_anggota: id, removed: true };
}

/** Handler `foto.get`: { file_id? , id_anggota? } */
function Foto_get_(ctx, p) {
  var fileId = '';
  if (p.file_id) {
    fileId = sanitizeText_(p.file_id, 128);
  } else if (p.id_anggota) {
    var aid = String(p.id_anggota);
    if (!isUuid_(aid)) throw ERR.validation([{ field: 'id_anggota', rule: 'uuid' }]);
    var a = Db.findOne(SHEET.ANGGOTA, 'id_anggota', aid);
    if (!a || (a.is_deleted && !rbacIsAdmin_(ctx))) throw ERR.notFound();
    fileId = a.foto_file_id || '';
  }

  if (!fileId || !allowedFotoIdSet_(ctx)[fileId]) throw ERR.notFound();
  try {
    return readDriveFoto_(fileId);
  } catch (e) {
    throw ERR.notFound();
  }
}

/** Handler `foto.getBatch`: { file_ids: [...] } */
function Foto_getBatch_(ctx, p) {
  var rawIds = Array.isArray(p.file_ids) ? p.file_ids : [];
  var allowed = allowedFotoIdSet_(ctx);
  var seen = {};
  var targetIds = [];
  for (var i = 0; i < rawIds.length && targetIds.length < APP.PHOTO_BATCH_MAX; i++) {
    var fid = sanitizeText_(rawIds[i], 128);
    if (fid && allowed[fid] && !seen[fid]) {
      seen[fid] = true;
      targetIds.push(fid);
    }
  }
  var fotos = {};
  targetIds.forEach(function (fid) {
    try {
      var res = readDriveFoto_(fid);
      fotos[fid] = { mime_type: res.mime_type, data_url: res.data_url };
    } catch (ignore) {}
  });
  return { fotos: fotos };
}
