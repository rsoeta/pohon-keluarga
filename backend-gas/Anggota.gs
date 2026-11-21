/**
 * Anggota.gs — CRUD Data_Anggota, sinkronisasi Dexie.js, validasi garis
 * keturunan (cycle detection), dan soft delete khusus Admin.
 */

/* =========================================================================
 * Indeks data (dibaca sekali per eksekusi)
 * ========================================================================= */
function loadIndex_() {
  var idx = {
    anggota: Db.rows(SHEET.ANGGOTA),
    pernikahan: Db.rows(SHEET.PERNIKAHAN),
    anggotaById: {},
    pernikahanById: {}
  };
  idx.anggota.forEach(function (a) { idx.anggotaById[a.id_anggota] = a; });
  idx.pernikahan.forEach(function (m) { idx.pernikahanById[m.id_pernikahan] = m; });
  return idx;
}

function anggotaDto_(row) {
  return Db.plain(SHEET.ANGGOTA, row);
}

/* =========================================================================
 * Validasi input
 * ========================================================================= */

/**
 * Whitelist & validasi field. Field di luar ANGGOTA_INPUT_FIELDS diabaikan
 * (mencegah mass-assignment is_deleted, kode_unik, foto_file_id, dll).
 */
function cleanAnggotaInput_(input, isCreate) {
  input = input && typeof input === 'object' ? input : {};
  var out = {};
  var errors = [];
  var has = function (k) { return hasOwn_(input, k); };

  if (isCreate || has('nama_lengkap')) {
    var nama = sanitizeText_(input.nama_lengkap, 120);
    if (nama.length < 2) errors.push({ field: 'nama_lengkap', rule: 'required' });
    out.nama_lengkap = nama;
  }
  if (isCreate || has('jenis_kelamin')) {
    if (ENUM.JENIS_KELAMIN.indexOf(input.jenis_kelamin) === -1) errors.push({ field: 'jenis_kelamin', rule: 'enum' });
    else out.jenis_kelamin = input.jenis_kelamin;
  }
  if (has('tgl_lahir')) {
    var tgl = normalizeTglLahir_(input.tgl_lahir);
    if (tgl === null) errors.push({ field: 'tgl_lahir', rule: 'format' });
    else out.tgl_lahir = tgl;
  }
  if (has('status_hidup')) {
    if (!isBoolLike_(input.status_hidup)) errors.push({ field: 'status_hidup', rule: 'boolean' });
    else out.status_hidup = toBool_(input.status_hidup);
  }
  if (has('urutan_anak')) {
    var u = input.urutan_anak;
    if (u === '' || u === null) out.urutan_anak = null;
    else if (!/^\d{1,2}$/.test(String(u)) || Number(u) < 1) errors.push({ field: 'urutan_anak', rule: 'int' });
    else out.urutan_anak = Number(u);
  }
  if (has('status_anak')) {
    if (ENUM.STATUS_ANAK.indexOf(input.status_anak) === -1) errors.push({ field: 'status_anak', rule: 'enum' });
    else out.status_anak = input.status_anak;
  }
  if (has('domisili')) out.domisili = sanitizeText_(input.domisili, 120);
  if (has('no_wa')) {
    var wa = normalizePhone_(input.no_wa);
    if (wa === null) errors.push({ field: 'no_wa', rule: 'phone' });
    else out.no_wa = wa;
  }
  LINEAGE_FIELDS.forEach(function (f) {
    if (has(f)) out[f] = optionalUuidField_(input, f, errors);
  });

  if (errors.length) throw ERR.validation(errors);
  return out;
}

/**
 * Menyelaraskan id_ayah / id_ibu / id_pernikahan_ortu, memvalidasi jenis kelamin
 * orang tua, dan mencegah looping nasab (target bukan keturunan profil ini).
 */
function resolveLineage_(rec, selfId, idx) {
  var ayah = rec.id_ayah || '';
  var ibu = rec.id_ibu || '';
  var pid = rec.id_pernikahan_ortu || '';

  if (pid) {
    var m = idx.pernikahanById[pid];
    if (!m || m.is_deleted) throw ERR.validation([{ field: 'id_pernikahan_ortu', rule: 'exists' }]);
    if ((ayah && ayah !== m.id_suami) || (ibu && ibu !== m.id_istri)) {
      throw ERR.validation([{ field: 'id_pernikahan_ortu', rule: 'mismatch' }]);
    }
    ayah = m.id_suami;
    ibu = m.id_istri;
  } else if (ayah && ibu) {
    var found = null;
    idx.pernikahan.forEach(function (x) {
      if (!x.is_deleted && x.id_suami === ayah && x.id_istri === ibu) {
        if (!found || x.status_pernikahan === 'Aktif') found = x;
      }
    });
    pid = found ? found.id_pernikahan : '';
  }

  var check = function (id, field, jk) {
    if (!id) return;
    if (selfId && id === selfId) throw ERR.validation([{ field: field, rule: 'self' }]);
    var p = idx.anggotaById[id];
    if (!p || p.is_deleted) throw ERR.validation([{ field: field, rule: 'exists' }]);
    if (p.jenis_kelamin !== jk) throw ERR.validation([{ field: field, rule: 'gender' }]);
    if (selfId && Nasab.isDescendant(idx.anggota, selfId, id)) throw ERR.conflict('CYCLE_DETECTED');
  };
  check(ayah, 'id_ayah', 'L');
  check(ibu, 'id_ibu', 'P');

  return { id_ayah: ayah, id_ibu: ibu, id_pernikahan_ortu: pid };
}

/** Urutan anak otomatis = jumlah saudara dengan orang tua yang sama + 1. */
function autoUrutanAnak_(rec, idx) {
  if (!rec.id_ayah && !rec.id_ibu) return null;
  var max = 0;
  idx.anggota.forEach(function (a) {
    if (a.is_deleted || a.id_anggota === rec.id_anggota) return;
    var same = rec.id_pernikahan_ortu
      ? a.id_pernikahan_ortu === rec.id_pernikahan_ortu
      : (a.id_ayah === rec.id_ayah && a.id_ibu === rec.id_ibu);
    if (same) max = Math.max(max, Number(a.urutan_anak || 0));
  });
  return max + 1;
}

/** Jenis kelamin dikunci bila profil sudah dirujuk sebagai orang tua/pasangan. */
function assertGenderChangeAllowed_(id, idx) {
  var referenced = idx.anggota.some(function (a) { return !a.is_deleted && (a.id_ayah === id || a.id_ibu === id); }) ||
    idx.pernikahan.some(function (m) { return !m.is_deleted && (m.id_suami === id || m.id_istri === id); });
  if (referenced) throw ERR.conflict('GENDER_LOCKED');
}

/* =========================================================================
 * Handler: baca
 * ========================================================================= */

/**
 * Sinkronisasi untuk Dexie.js.
 *  - payload.since kosong → full sync (hanya data aktif).
 *  - payload.since (ISO) → delta: baris dengan updated_at > since (dikurangi jendela
 *    tumpang-tindih) termasuk tombstone (is_deleted) agar klien menghapus lokal.
 */
function Data_sync_(ctx, p) {
  var serverTime = nowIso_();
  var since = null;
  if (typeof p.since === 'string' && p.since && !isNaN(Date.parse(p.since))) {
    since = new Date(Date.parse(p.since) - APP.SYNC_OVERLAP_MS).toISOString();
  }
  var admin = rbacIsAdmin_(ctx);
  var pick = function (rows, pk, sheetName) {
    var out = [];
    rows.forEach(function (r) {
      if (!since) {
        if (!r.is_deleted) out.push(Db.plain(sheetName, r));
        return;
      }
      if (r.updated_at && r.updated_at <= since) return;
      if (r.is_deleted && !admin) {
        var t = { is_deleted: true, updated_at: r.updated_at };
        t[pk] = r[pk];
        out.push(t);
      } else {
        out.push(Db.plain(sheetName, r));
      }
    });
    return out;
  };
  return {
    server_time: serverTime,
    full: !since,
    anggota: pick(Db.rows(SHEET.ANGGOTA), 'id_anggota', SHEET.ANGGOTA),
    pernikahan: pick(Db.rows(SHEET.PERNIKAHAN), 'id_pernikahan', SHEET.PERNIKAHAN),
    pengaturan: getPublicSettings_(),
    me: ctx.user
  };
}

/** Profil detail lengkap: orang tua, pasangan (+status), anak, dan hak edit. */
function Anggota_get_(ctx, p) {
  var id = String(p.id_anggota || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_anggota', rule: 'uuid' }]);
  var idx = loadIndex_();
  var a = idx.anggotaById[id];
  if (!a || (a.is_deleted && !rbacIsAdmin_(ctx))) throw ERR.notFound();

  var live = function (x) { return x && !x.is_deleted ? anggotaDto_(x) : null; };
  var pasangan = idx.pernikahan
    .filter(function (m) { return !m.is_deleted && (m.id_suami === id || m.id_istri === id); })
    .map(function (m) {
      var other = idx.anggotaById[m.id_suami === id ? m.id_istri : m.id_suami];
      return { pernikahan: Db.plain(SHEET.PERNIKAHAN, m), anggota: live(other) };
    })
    .filter(function (x) { return x.anggota; })
    .sort(function (x, y) { return (x.pernikahan.urutan_pasangan || 99) - (y.pernikahan.urutan_pasangan || 99); });
  var anak = idx.anggota
    .filter(function (c) { return !c.is_deleted && (c.id_ayah === id || c.id_ibu === id); })
    .map(anggotaDto_)
    .sort(function (x, y) { return (x.urutan_anak || 99) - (y.urutan_anak || 99); });

  var editable = rbacIsAdmin_(ctx) || !!rbacEditableSet_(ctx, idx)[id];
  return {
    anggota: anggotaDto_(a),
    ayah: live(idx.anggotaById[a.id_ayah]),
    ibu: live(idx.anggotaById[a.id_ibu]),
    pasangan: pasangan,
    anak: anak,
    hak: { edit: editable, hapus: rbacIsAdmin_(ctx) }
  };
}

/* =========================================================================
 * Handler: tulis (dipanggil di dalam LockService)
 * ========================================================================= */

/**
 * payload: {
 *   data:   { nama_lengkap, jenis_kelamin, tgl_lahir, ..., id_ayah, id_ibu, id_pernikahan_ortu },
 *   relasi: { jenis: 'PASANGAN', id_pasangan, status_pernikahan, urutan_pasangan }   (opsional)
 * }
 */
function Anggota_create_(ctx, p) {
  var clean = cleanAnggotaInput_(p.data, true);
  var idx = loadIndex_();

  var rec = {
    id_anggota: Utilities.getUuid(),
    kode_unik: '',
    gedcom_xref_id: '',
    nama_lengkap: clean.nama_lengkap,
    jenis_kelamin: clean.jenis_kelamin,
    tgl_lahir: clean.tgl_lahir || '',
    status_hidup: hasOwn_(clean, 'status_hidup') ? clean.status_hidup : true,
    urutan_anak: hasOwn_(clean, 'urutan_anak') ? clean.urutan_anak : null,
    status_anak: clean.status_anak || 'Kandung',
    domisili: clean.domisili || '',
    no_wa: clean.no_wa || '',
    foto_file_id: '',
    id_ayah: clean.id_ayah || '',
    id_ibu: clean.id_ibu || '',
    id_pernikahan_ortu: clean.id_pernikahan_ortu || '',
    is_deleted: false,
    updated_at: nowIso_()
  };

  // Pra-cek RBAC sebelum resolveLineage_/cleanRelasiPasangan_ agar percobaan ilegal
  // selalu membalas 403 Forbidden generik tanpa membocorkan info UUID profil lain.
  if (!rbacIsAdmin_(ctx)) {
    var me = rbacMyAnggotaId_(ctx, idx);
    if (!me) throw ERR.forbidden();
    if (p.relasi) {
      if (typeof p.relasi !== 'object' || p.relasi.jenis !== 'PASANGAN' ||
          String(p.relasi.id_pasangan || '').toLowerCase() !== me) {
        throw ERR.forbidden();
      }
      if (rec.id_ayah || rec.id_ibu || rec.id_pernikahan_ortu) throw ERR.forbidden();
    } else {
      var pm = rec.id_pernikahan_ortu ? idx.pernikahanById[rec.id_pernikahan_ortu] : null;
      var hasMeMarriage = !!(pm && !pm.is_deleted && (pm.id_suami === me || pm.id_istri === me));
      if (rec.id_ayah !== me && rec.id_ibu !== me && !hasMeMarriage) throw ERR.forbidden();
      if (rec.id_ayah === me && rec.id_ibu && !rbacIsMarried_(me, rec.id_ibu, idx)) throw ERR.forbidden();
      if (rec.id_ibu === me && rec.id_ayah && !rbacIsMarried_(me, rec.id_ayah, idx)) throw ERR.forbidden();
    }
  }

  var lineage = resolveLineage_(rec, null, idx);
  rec.id_ayah = lineage.id_ayah;
  rec.id_ibu = lineage.id_ibu;
  rec.id_pernikahan_ortu = lineage.id_pernikahan_ortu;

  var relasi = null;
  if (p.relasi) relasi = cleanRelasiPasangan_(p.relasi, rec, idx);

  rbacAssertCanCreateAnggota_(ctx, rec, relasi, idx);

  if (rec.urutan_anak === null) rec.urutan_anak = autoUrutanAnak_(rec, idx);
  var kodeSet = {};
  idx.anggota.forEach(function (a) { kodeSet[a.kode_unik] = true; });
  rec.kode_unik = generateKodeUnik_(kodeSet);

  var row = Db.insert(SHEET.ANGGOTA, rec);
  idx.anggota.push(row);
  idx.anggotaById[row.id_anggota] = row;
  logActivity_(ctx, 'CREATE', row.id_anggota, { entitas: 'anggota', nama: row.nama_lengkap });

  var pernikahan = null;
  if (relasi) {
    var pr = pernikahanInsert_(ctx, idx, {
      id_suami: rec.jenis_kelamin === 'L' ? rec.id_anggota : relasi.id_pasangan,
      id_istri: rec.jenis_kelamin === 'P' ? rec.id_anggota : relasi.id_pasangan,
      status_pernikahan: relasi.status_pernikahan,
      urutan_pasangan: relasi.urutan_pasangan
    });
    pernikahan = Db.plain(SHEET.PERNIKAHAN, pr);
  }
  return { anggota: anggotaDto_(row), pernikahan: pernikahan };
}

function cleanRelasiPasangan_(r, rec, idx) {
  var errors = [];
  if (!r || typeof r !== 'object' || r.jenis !== 'PASANGAN') throw ERR.validation([{ field: 'relasi.jenis', rule: 'enum' }]);
  var pid = optionalUuidField_(r, 'id_pasangan', errors);
  if (!pid) errors.push({ field: 'relasi.id_pasangan', rule: 'required' });
  var status = r.status_pernikahan || 'Aktif';
  if (ENUM.STATUS_PERNIKAHAN.indexOf(status) === -1) errors.push({ field: 'relasi.status_pernikahan', rule: 'enum' });
  var urutan = null;
  if (r.urutan_pasangan !== undefined && r.urutan_pasangan !== null && r.urutan_pasangan !== '') {
    if (!/^\d{1,2}$/.test(String(r.urutan_pasangan)) || Number(r.urutan_pasangan) < 1) {
      errors.push({ field: 'relasi.urutan_pasangan', rule: 'int' });
    } else {
      urutan = Number(r.urutan_pasangan);
    }
  }
  if (errors.length) throw ERR.validation(errors);
  var partner = idx.anggotaById[pid];
  if (!partner || partner.is_deleted) throw ERR.validation([{ field: 'relasi.id_pasangan', rule: 'exists' }]);
  if (partner.jenis_kelamin === rec.jenis_kelamin) throw ERR.validation([{ field: 'jenis_kelamin', rule: 'gender' }]);
  return { jenis: 'PASANGAN', id_pasangan: pid, status_pernikahan: status, urutan_pasangan: urutan };
}

/** payload: { id_anggota, data: { ...field yang diubah } } */
function Anggota_update_(ctx, p) {
  var id = String(p.id_anggota || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_anggota', rule: 'uuid' }]);
  var idx = loadIndex_();
  var before = idx.anggotaById[id];
  if (!before || before.is_deleted) throw ERR.notFound();

  rbacAssertCanEditAnggota_(ctx, id, idx);
  var clean = cleanAnggotaInput_(p.data, false);

  var merged = anggotaDto_(before);
  Object.keys(clean).forEach(function (k) { merged[k] = clean[k]; });

  var lineageTouched = LINEAGE_FIELDS.some(function (f) { return hasOwn_(clean, f); });
  if (lineageTouched) {
    // Bila hanya id_ayah/id_ibu diubah, pernikahan ortu lama tidak boleh menimpa.
    if (!hasOwn_(clean, 'id_pernikahan_ortu') && (hasOwn_(clean, 'id_ayah') || hasOwn_(clean, 'id_ibu'))) {
      merged.id_pernikahan_ortu = '';
    }
    if (!rbacIsAdmin_(ctx)) {
      var meUpd = rbacMyAnggotaId_(ctx, idx);
      if (!meUpd || before.id_anggota === meUpd || (before.id_ayah !== meUpd && before.id_ibu !== meUpd)) {
        throw ERR.forbidden();
      }
      rbacAssertLineageChange_(ctx, before, merged, idx);
    }
    var lineage = resolveLineage_(merged, id, idx);
    merged.id_ayah = lineage.id_ayah;
    merged.id_ibu = lineage.id_ibu;
    merged.id_pernikahan_ortu = lineage.id_pernikahan_ortu;
  }
  rbacAssertLineageChange_(ctx, before, merged, idx);

  if (merged.jenis_kelamin !== before.jenis_kelamin) assertGenderChangeAllowed_(id, idx);

  var fields = ANGGOTA_INPUT_FIELDS;
  var diff = diffFields_(before, merged, fields);
  if (!Object.keys(diff).length) return { anggota: anggotaDto_(before), changed: false };

  var changes = {};
  Object.keys(diff).forEach(function (k) { changes[k] = merged[k]; });
  changes.updated_at = nowIso_();
  Db.update(SHEET.ANGGOTA, before, changes);
  logActivity_(ctx, 'UPDATE', id, { entitas: 'anggota', perubahan: diff });
  return { anggota: anggotaDto_(before), changed: true };
}

/** Soft delete (Admin): hanya is_deleted = TRUE, referensi lain tetap utuh. */
function Anggota_softDelete_(ctx, p) {
  var id = String(p.id_anggota || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_anggota', rule: 'uuid' }]);
  var row = Db.findOne(SHEET.ANGGOTA, 'id_anggota', id);
  if (!row) throw ERR.notFound();
  if (row.is_deleted) return { anggota: anggotaDto_(row), changed: false };
  Db.update(SHEET.ANGGOTA, row, { is_deleted: true, updated_at: nowIso_() });
  logActivity_(ctx, 'SOFT_DELETE', id, { entitas: 'anggota', nama: row.nama_lengkap });
  return { anggota: anggotaDto_(row), changed: true };
}

function Anggota_restore_(ctx, p) {
  var id = String(p.id_anggota || '');
  if (!isUuid_(id)) throw ERR.validation([{ field: 'id_anggota', rule: 'uuid' }]);
  var row = Db.findOne(SHEET.ANGGOTA, 'id_anggota', id);
  if (!row) throw ERR.notFound();
  if (!row.is_deleted) return { anggota: anggotaDto_(row), changed: false };
  Db.update(SHEET.ANGGOTA, row, { is_deleted: false, updated_at: nowIso_() });
  logActivity_(ctx, 'RESTORE', id, { entitas: 'anggota', nama: row.nama_lengkap });
  return { anggota: anggotaDto_(row), changed: true };
}

function Anggota_listDeleted_() {
  return {
    anggota: Db.rows(SHEET.ANGGOTA).filter(function (a) { return a.is_deleted; }).map(anggotaDto_),
    pernikahan: Db.rows(SHEET.PERNIKAHAN).filter(function (m) { return m.is_deleted; })
      .map(function (m) { return Db.plain(SHEET.PERNIKAHAN, m); })
  };
}
