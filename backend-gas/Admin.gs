/**
 * Admin.gs — Panel Administrator: kelola pengguna, pengaturan sistem,
 * penyimpanan token WA Gateway ke PropertiesService, dan statistik keluarga.
 */

var SETTINGS_KEYS_ = Object.freeze([
  'nama_keluarga',
  'id_leluhur_utama',
  'font_family',
  'wa_aktif',
  'wa_provider',
  'wa_gateway_url',
  'wa_group_id',
  'wa_jam_trigger',
  'wa_template'
]);

function getAllSettings_() {
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = DEFAULT_SETTINGS[k]; });
  Db.rows(SHEET.PENGATURAN).forEach(function (r) {
    if (hasOwn_(DEFAULT_SETTINGS, r.kunci)) out[r.kunci] = String(r.nilai === null || r.nilai === undefined ? '' : r.nilai);
  });
  return out;
}

function getPublicSettings_() {
  return pick_(getAllSettings_(), PUBLIC_SETTING_KEYS);
}

function Settings_public_() {
  return getPublicSettings_();
}

function adminUserDto_(u, anggotaById) {
  var a = u.id_anggota && anggotaById ? anggotaById[u.id_anggota] : null;
  return {
    id_user: u.id_user,
    username: u.username,
    id_anggota: u.id_anggota || '',
    nama_anggota: (a && !a.is_deleted) ? a.nama_lengkap : '',
    role: ENUM.ROLE.indexOf(u.role) >= 0 ? u.role : 'User',
    status_aktif: !!u.status_aktif,
    token_version: Number(u.token_version || 0)
  };
}

/* =========================================================================
 * Pengaturan Sistem & WA Token
 * ========================================================================= */
function Admin_getSettings_() {
  var s = getAllSettings_();
  s.wa_token_configured = !!PropertiesService.getScriptProperties().getProperty(PROP.WA_TOKEN);
  return s;
}

function Admin_updateSettings_(ctx, p) {
  p = p && typeof p === 'object' ? p : {};
  var errors = [];
  var updates = {};
  var idx = loadIndex_();

  SETTINGS_KEYS_.forEach(function (k) {
    if (!hasOwn_(p, k)) return;
    var v = p[k];
    if (k === 'nama_keluarga') {
      var nm = sanitizeText_(v, 80);
      if (nm.length < 2) errors.push({ field: k, rule: 'required' });
      else updates[k] = nm;
    } else if (k === 'id_leluhur_utama') {
      var aid = optionalUuidField_(p, k, errors);
      if (aid && (!idx.anggotaById[aid] || idx.anggotaById[aid].is_deleted)) {
        errors.push({ field: k, rule: 'exists' });
      } else {
        updates[k] = aid;
      }
    } else if (k === 'font_family') {
      var ff = typeof v === 'string' ? v.replace(/ +/g, ' ').trim() : '';
      if (!ff || !/^[A-Za-z][A-Za-z0-9 ]{1,49}$/.test(ff)) {
        errors.push({ field: k, rule: 'format' });
      } else {
        updates[k] = ff;
      }
    } else if (k === 'wa_aktif') {
      if (!isBoolLike_(v)) errors.push({ field: k, rule: 'boolean' });
      else updates[k] = toBool_(v) ? 'true' : 'false';
    } else if (k === 'wa_provider') {
      if (ENUM.WA_PROVIDER.indexOf(v) === -1) errors.push({ field: k, rule: 'enum' });
      else updates[k] = v;
    } else if (k === 'wa_gateway_url') {
      var url = String(v === null || v === undefined ? '' : v).trim();
      if (url && !isSafeHttpsUrl_(url)) errors.push({ field: k, rule: 'https' });
      else updates[k] = url;
    } else if (k === 'wa_group_id') {
      updates[k] = sanitizeText_(v, 100);
    } else if (k === 'wa_jam_trigger') {
      var hr = Number(v);
      if (!/^\d{1,2}$/.test(String(v)) || !isFinite(hr) || hr < 0 || hr > 23) {
        errors.push({ field: k, rule: 'range' });
      } else {
        updates[k] = String(Math.trunc(hr));
      }
    } else if (k === 'wa_template') {
      updates[k] = sanitizeText_(v, 1000, true);
    }
  });

  if (errors.length) throw ERR.validation(errors);
  var keysChanged = Object.keys(updates);
  if (!keysChanged.length) return Admin_getSettings_();

  var existingRows = Db.indexBy(SHEET.PENGATURAN, 'kunci');
  var toUpdate = [];
  var toInsert = [];
  keysChanged.forEach(function (k) {
    if (existingRows[k]) {
      existingRows[k].nilai = updates[k];
      toUpdate.push(existingRows[k]);
    } else {
      toInsert.push({ kunci: k, nilai: updates[k] });
    }
  });
  if (toUpdate.length) Db.writeRows(SHEET.PENGATURAN, toUpdate);
  if (toInsert.length) Db.insertMany(SHEET.PENGATURAN, toInsert);

  if (hasOwn_(updates, 'wa_aktif') || hasOwn_(updates, 'wa_jam_trigger')) {
    var next = getAllSettings_();
    try {
      syncBirthdayTrigger_(Number(next.wa_jam_trigger || 6), next.wa_aktif === 'true');
    } catch (e) {
      console.warn(JSON.stringify({ event: 'TRIGGER_SYNC_WARN', error: String(e && e.message ? e.message : e) }));
    }
  }

  logActivity_(ctx, 'UPDATE', 'PENGATURAN', { entitas: 'pengaturan', kunci: keysChanged });
  return Admin_getSettings_();
}

/** Menyimpan/menghapus token WA Gateway di PropertiesService (bukan di Sheet). */
function Admin_setWaToken_(ctx, p) {
  var token = typeof p.token === 'string' ? p.token.trim() : '';
  if (token.length > 512) throw ERR.validation([{ field: 'token', rule: 'max_length' }]);
  var props = PropertiesService.getScriptProperties();
  if (!token) props.deleteProperty(PROP.WA_TOKEN);
  else props.setProperty(PROP.WA_TOKEN, token);

  logActivity_(ctx, 'UPDATE', 'WA_TOKEN', { entitas: 'pengaturan', wa_token_configured: !!token });
  return { wa_token_configured: !!token };
}

/* =========================================================================
 * Kelola Pengguna
 * ========================================================================= */
function Admin_listUsers_() {
  var anggotaById = Db.indexBy(SHEET.ANGGOTA, 'id_anggota');
  return {
    users: Db.rows(SHEET.PENGGUNA).map(function (u) { return adminUserDto_(u, anggotaById); })
  };
}

function Admin_createUser_(ctx, p) {
  var errors = [];
  var username = normalizeUsername_(p.username);
  if (!username) errors.push({ field: 'username', rule: 'format' });

  var password = typeof p.password === 'string' ? p.password : '';
  if (!validatePasswordPolicy_(password)) errors.push({ field: 'password', rule: 'policy' });

  var role = p.role === undefined ? 'User' : p.role;
  if (ENUM.ROLE.indexOf(role) === -1) errors.push({ field: 'role', rule: 'enum' });

  var idAnggota = optionalUuidField_(p, 'id_anggota', errors);
  var statusAktif = hasOwn_(p, 'status_aktif')
    ? (isBoolLike_(p.status_aktif) ? toBool_(p.status_aktif) : (errors.push({ field: 'status_aktif', rule: 'boolean' }), true))
    : true;

  if (errors.length) throw ERR.validation(errors);

  var users = Db.rows(SHEET.PENGGUNA);
  if (users.some(function (u) { return String(u.username || '').toLowerCase() === username; })) {
    throw ERR.conflict('USERNAME_EXISTS');
  }

  var anggotaById = Db.indexBy(SHEET.ANGGOTA, 'id_anggota');
  if (idAnggota) {
    var target = anggotaById[idAnggota];
    if (!target || target.is_deleted) throw ERR.validation([{ field: 'id_anggota', rule: 'exists' }]);
    if (users.some(function (u) { return u.status_aktif && u.id_anggota === idAnggota; })) {
      throw ERR.conflict('ANGGOTA_ALREADY_LINKED');
    }
  }

  var rec = {
    id_user: Utilities.getUuid(),
    username: username,
    password_hash: hashPassword_(password),
    id_anggota: idAnggota,
    role: role,
    status_aktif: statusAktif,
    token_version: 1
  };
  var row = Db.insert(SHEET.PENGGUNA, rec);
  logActivity_(ctx, 'CREATE', row.id_user, { entitas: 'pengguna', username: row.username, role: row.role });
  return { user: adminUserDto_(row, anggotaById) };
}

function Admin_updateUser_(ctx, p) {
  var idUser = String(p.id_user || '');
  if (!isUuid_(idUser)) throw ERR.validation([{ field: 'id_user', rule: 'uuid' }]);

  var users = Db.rows(SHEET.PENGGUNA);
  var row = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].id_user === idUser) { row = users[i]; break; }
  }
  if (!row) throw ERR.notFound();

  var errors = [];
  var nextRole = row.role;
  var nextAnggota = row.id_anggota || '';
  var nextStatus = !!row.status_aktif;

  if (hasOwn_(p, 'role')) {
    if (ENUM.ROLE.indexOf(p.role) === -1) errors.push({ field: 'role', rule: 'enum' });
    else nextRole = p.role;
  }
  if (hasOwn_(p, 'id_anggota')) {
    nextAnggota = optionalUuidField_(p, 'id_anggota', errors);
  }
  if (hasOwn_(p, 'status_aktif')) {
    if (!isBoolLike_(p.status_aktif)) errors.push({ field: 'status_aktif', rule: 'boolean' });
    else nextStatus = toBool_(p.status_aktif);
  }
  if (errors.length) throw ERR.validation(errors);

  // Proteksi agar selalu tersisa minimal 1 Admin aktif
  var activeAdmins = users.filter(function (u) { return u.role === 'Admin' && u.status_aktif; }).length;
  if (row.role === 'Admin' && row.status_aktif && (nextRole !== 'Admin' || !nextStatus) && activeAdmins <= 1) {
    throw ERR.conflict('LAST_ADMIN');
  }

  var anggotaById = Db.indexBy(SHEET.ANGGOTA, 'id_anggota');
  if (nextAnggota && nextAnggota !== row.id_anggota) {
    var target = anggotaById[nextAnggota];
    if (!target || target.is_deleted) throw ERR.validation([{ field: 'id_anggota', rule: 'exists' }]);
    if (users.some(function (u) { return u.id_user !== idUser && u.status_aktif && u.id_anggota === nextAnggota; })) {
      throw ERR.conflict('ANGGOTA_ALREADY_LINKED');
    }
  }

  var changes = {};
  if (nextRole !== row.role) changes.role = nextRole;
  if (nextAnggota !== (row.id_anggota || '')) changes.id_anggota = nextAnggota;
  if (nextStatus !== !!row.status_aktif) changes.status_aktif = nextStatus;

  if (!Object.keys(changes).length) return { user: adminUserDto_(row, anggotaById), changed: false };
  if (hasOwn_(changes, 'role') || (hasOwn_(changes, 'status_aktif') && !nextStatus)) {
    changes.token_version = Number(row.token_version || 0) + 1;
  }

  Db.update(SHEET.PENGGUNA, row, changes);
  logActivity_(ctx, 'UPDATE', idUser, { entitas: 'pengguna', perubahan: Object.keys(changes) });
  return { user: adminUserDto_(row, anggotaById), changed: true };
}

function Admin_resetPassword_(ctx, p) {
  var idUser = String(p.id_user || '');
  if (!isUuid_(idUser)) throw ERR.validation([{ field: 'id_user', rule: 'uuid' }]);
  var row = Db.findOne(SHEET.PENGGUNA, 'id_user', idUser);
  if (!row) throw ERR.notFound();

  var pw = typeof p.password_baru === 'string' ? p.password_baru : '';
  if (!validatePasswordPolicy_(pw)) throw ERR.validation([{ field: 'password_baru', rule: 'policy' }]);

  Db.update(SHEET.PENGGUNA, row, {
    password_hash: hashPassword_(pw),
    token_version: Number(row.token_version || 0) + 1
  });
  logActivity_(ctx, 'UPDATE', idUser, { entitas: 'pengguna', perubahan: ['password_reset'] });
  return { reset: true, id_user: idUser };
}

function Admin_revokeSessions_(ctx, p) {
  var idUser = String(p.id_user || '');
  if (!isUuid_(idUser)) throw ERR.validation([{ field: 'id_user', rule: 'uuid' }]);
  var row = Db.findOne(SHEET.PENGGUNA, 'id_user', idUser);
  if (!row) throw ERR.notFound();

  var nextTv = Number(row.token_version || 0) + 1;
  Db.update(SHEET.PENGGUNA, row, { token_version: nextTv });
  logActivity_(ctx, 'UPDATE', idUser, { entitas: 'pengguna', perubahan: ['revoke_sessions'] });
  return { revoked: true, id_user: idUser, token_version: nextTv };
}

/* =========================================================================
 * Statistik Keluarga
 * ========================================================================= */
function Admin_stats_() {
  var anggota = Db.rows(SHEET.ANGGOTA);
  var pernikahan = Db.rows(SHEET.PERNIKAHAN);
  var users = Db.rows(SHEET.PENGGUNA);

  var aktif = anggota.filter(function (a) { return !a.is_deleted; });
  var laki = 0, perempuan = 0, hidup = 0, wafat = 0, angkat = 0;
  aktif.forEach(function (a) {
    if (a.jenis_kelamin === 'L') laki++; else perempuan++;
    if (a.status_hidup) hidup++; else wafat++;
    if (a.status_anak === 'Angkat') angkat++;
  });

  var pAktif = 0, pCerai = 0, pWafat = 0;
  pernikahan.forEach(function (m) {
    if (m.is_deleted) return;
    if (m.status_pernikahan === 'Aktif') pAktif++;
    else if (m.status_pernikahan === 'Cerai') pCerai++;
    else if (m.status_pernikahan === 'Wafat') pWafat++;
  });

  var uAktif = 0, uAdmin = 0;
  users.forEach(function (u) {
    if (u.status_aktif) uAktif++;
    if (u.status_aktif && u.role === 'Admin') uAdmin++;
  });

  var settings = getAllSettings_();
  return {
    anggota: {
      total_aktif: aktif.length,
      laki_laki: laki,
      perempuan: perempuan,
      hidup: hidup,
      wafat: wafat,
      anak_angkat: angkat,
      terhapus: anggota.length - aktif.length
    },
    pernikahan: {
      total_aktif: pAktif + pCerai + pWafat,
      aktif: pAktif,
      cerai: pCerai,
      wafat: pWafat
    },
    pengguna: {
      total: users.length,
      aktif: uAktif,
      admin_aktif: uAdmin
    },
    ulang_tahun_hari_ini: getTodaysBirthdays_(anggota, todayString_()).length,
    wa_aktif: settings.wa_aktif === 'true',
    wa_token_configured: !!PropertiesService.getScriptProperties().getProperty(PROP.WA_TOKEN)
  };
}
