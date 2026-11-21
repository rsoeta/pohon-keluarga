/**
 * Gedcom.gs — Parser & importer GEDCOM (.ged) khusus Admin.
 *
 * Fitur keamanan & integritas:
 *  - Pratinjau (`gedcom.preview`) sebelum eksekusi untuk mencegah duplikasi massal.
 *  - Pencocokan idempoten via `gedcom_xref_id` (mis. `@I1@`, dilindungi Anti-Formula via Db).
 *  - Cycle Detection saat menautkan orang tua-anak.
 *  - Sanitasi anti-XSS + validasi tanggal lahir parsial + pelabelan anak angkat.
 */

var GEDCOM_MONTHS_ = Object.freeze({
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
});

function parseGedcomDate_(raw) {
  if (!raw) return '';
  var s = String(raw).trim().toUpperCase();
  if (!s) return '';

  // Format ISO langsung
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return normalizeTglLahir_(s) || '';
  }

  // Format GEDCOM lengkap: DD MMM YYYY (abaikan prefiks ABT/EST/CAL jika diikuti tanggal)
  var cleaned = s.replace(/^(ABT|EST|CAL|AFT|BEF|INT)\s+/, '');
  var full = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/.exec(cleaned);
  if (full && GEDCOM_MONTHS_[full[2]]) {
    var dd = ('0' + full[1]).slice(-2);
    var iso = full[3] + '-' + GEDCOM_MONTHS_[full[2]] + '-' + dd;
    var ok = normalizeTglLahir_(iso);
    if (ok) return ok;
  }

  // Tanggal parsial: ambil tahun 4 digit pertama
  var ym = /\b(\d{4})\b/.exec(cleaned);
  if (ym) {
    return normalizeTglLahir_(ym[1]) || '';
  }
  return '';
}

function cleanGedcomName_(raw) {
  var s = String(raw || '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  return sanitizeText_(s, 120);
}

/** Mem-parse isi file .ged menjadi { individuals, families, warnings }. */
function parseGedcom_(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw ERR.validation([{ field: 'content', rule: 'required' }]);
  }
  if (rawText.length > APP.MAX_GEDCOM_CHARS) throw ERR.tooLarge();

  var text = rawText.replace(/^\uFEFF/, '');
  var lines = text.split(/\r\n|\r|\n/);

  var individuals = [];
  var families = [];
  var warnings = [];

  var curType = '';
  var curRec = null;
  var lvl1Tag = '';
  var lvl2Tag = '';
  var curChilRef = null;
  var hasResiPlac = false;
  var lineRe = /^\s*(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/;

  var flushRec = function () {
    if (!curRec) return;
    if (curType === 'INDI') {
      if (!curRec.nama_lengkap) curRec.nama_lengkap = curRec.xref;
      if (!curRec.jenis_kelamin) {
        curRec.jenis_kelamin = 'L';
        warnings.push({ xref: curRec.xref, code: 'UNKNOWN_SEX' });
      }
      individuals.push(curRec);
    } else if (curType === 'FAM') {
      families.push(curRec);
    }
    curRec = null;
    curType = '';
    lvl1Tag = '';
    lvl2Tag = '';
    curChilRef = null;
    hasResiPlac = false;
  };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line || !line.trim()) continue;
    var m = lineRe.exec(line);
    if (!m) continue;

    var level = Number(m[1]);
    var xref = m[2] ? m[2].toUpperCase() : '';
    var tag = m[3].toUpperCase();
    var val = m[4] !== undefined ? String(m[4]).trim() : '';

    if (level === 0) {
      flushRec();
      if (xref && tag === 'INDI') {
        curType = 'INDI';
        curRec = {
          xref: xref,
          nama_lengkap: '',
          jenis_kelamin: '',
          tgl_lahir: '',
          status_hidup: true,
          status_anak: 'Kandung',
          domisili: '',
          no_wa: '',
          famc_xref: '',
          _raw_birt_date: ''
        };
      } else if (xref && tag === 'FAM') {
        curType = 'FAM';
        curRec = {
          xref: xref,
          husb_xref: '',
          wife_xref: '',
          chil_xrefs: [],
          divorced: false
        };
      }
      continue;
    }

    if (!curRec) continue;

    if (level === 1) {
      lvl1Tag = tag;
      lvl2Tag = '';
      curChilRef = null;

      if (curType === 'INDI') {
        if (tag === 'NAME' && !curRec.nama_lengkap) {
          curRec.nama_lengkap = cleanGedcomName_(val);
        } else if (tag === 'SEX') {
          var sx = val.toUpperCase();
          if (sx === 'M' || sx === 'L') curRec.jenis_kelamin = 'L';
          else if (sx === 'F' || sx === 'P') curRec.jenis_kelamin = 'P';
        } else if (tag === 'DEAT') {
          if (val.toUpperCase() !== 'N' && val.toUpperCase() !== 'NO') {
            curRec.status_hidup = false;
          }
        } else if (tag === 'ADOP') {
          curRec.status_anak = 'Angkat';
        } else if (tag === 'PHON' && !curRec.no_wa) {
          var ph = normalizePhone_(val);
          if (ph === null) warnings.push({ xref: curRec.xref, code: 'INVALID_PHONE' });
          else curRec.no_wa = ph;
        } else if (tag === 'FAMC' && /^@[^@]+@$/.test(val)) {
          if (!curRec.famc_xref) curRec.famc_xref = val.toUpperCase();
        }
      } else if (curType === 'FAM') {
        if (tag === 'HUSB' && /^@[^@]+@$/.test(val)) {
          curRec.husb_xref = val.toUpperCase();
        } else if (tag === 'WIFE' && /^@[^@]+@$/.test(val)) {
          curRec.wife_xref = val.toUpperCase();
        } else if (tag === 'CHIL' && /^@[^@]+@$/.test(val)) {
          curChilRef = { xref: val.toUpperCase(), adopted: false };
          curRec.chil_xrefs.push(curChilRef);
        } else if (tag === 'DIV') {
          if (val.toUpperCase() !== 'N' && val.toUpperCase() !== 'NO') curRec.divorced = true;
        }
      }
      continue;
    }

    if (level === 2) {
      if (tag === 'CONC' || tag === 'CONT') {
        var joiner = tag === 'CONT' ? ' ' : '';
        if (curType === 'INDI' && lvl1Tag === 'NAME' && val) {
          curRec.nama_lengkap = sanitizeText_(curRec.nama_lengkap + joiner + val.replace(/\//g, ' '), 120);
        }
        continue;
      }
      lvl2Tag = tag;

      if (curType === 'INDI') {
        if (lvl1Tag === 'BIRT' && tag === 'DATE' && !curRec.tgl_lahir) {
          var parsedDate = parseGedcomDate_(val);
          if (!parsedDate && val) warnings.push({ xref: curRec.xref, code: 'INVALID_DATE' });
          curRec.tgl_lahir = parsedDate;
        } else if (lvl1Tag === 'RESI' && (tag === 'PLAC' || tag === 'ADDR')) {
          var resiPlace = sanitizeText_(val, 120);
          if (resiPlace) {
            curRec.domisili = resiPlace;
            hasResiPlac = true;
          }
        } else if (lvl1Tag === 'BIRT' && tag === 'PLAC' && !hasResiPlac && !curRec.domisili) {
          curRec.domisili = sanitizeText_(val, 120);
        } else if (lvl1Tag === 'FAMC' && tag === 'PEDI') {
          if (/adopted|foster/i.test(val)) curRec.status_anak = 'Angkat';
        }
      } else if (curType === 'FAM' && lvl1Tag === 'CHIL' && curChilRef) {
        if ((tag === 'PEDI' && /adopted|foster/i.test(val)) || tag === 'ADOP') {
          curChilRef.adopted = true;
        }
      }
      continue;
    }

    if (level === 3 && (tag === 'CONC' || tag === 'CONT') && curType === 'INDI') {
      if (lvl1Tag === 'RESI' && (lvl2Tag === 'PLAC' || lvl2Tag === 'ADDR') && val) {
        curRec.domisili = sanitizeText_(curRec.domisili + (tag === 'CONT' ? ' ' : '') + val, 120);
      }
    }
  }

  flushRec();
  if (!individuals.length) throw ERR.validation([{ field: 'content', rule: 'empty_gedcom' }]);
  if (individuals.length > APP.MAX_GEDCOM_INDIVIDUALS) throw ERR.tooLarge();

  return { individuals: individuals, families: families, warnings: warnings };
}

function gedcomExistingXrefMap_(idx) {
  var map = {};
  idx.anggota.forEach(function (a) {
    if (!a.is_deleted && a.gedcom_xref_id) {
      map[String(a.gedcom_xref_id).toUpperCase()] = a;
    }
  });
  return map;
}

function gedcomMarriageSet_(idx) {
  var map = {};
  idx.pernikahan.forEach(function (m) {
    if (!m.is_deleted && m.id_suami && m.id_istri) {
      var k = m.id_suami + '|' + m.id_istri;
      if (!map[k] || m.status_pernikahan === 'Aktif') map[k] = m.id_pernikahan;
    }
  });
  return map;
}

/** Handler `gedcom.preview` (Admin): pratinjau jumlah data & potensi peringatan. */
function Gedcom_preview_(ctx, p) {
  var parsed = parseGedcom_(p.content);
  var idx = loadIndex_();
  var existingByXref = gedcomExistingXrefMap_(idx);
  var marriageSet = gedcomMarriageSet_(idx);

  var indiBaru = 0;
  var indiUpdate = 0;
  var sampleBaru = [];
  var sampleUpdate = [];
  var parsedByXref = {};

  parsed.individuals.forEach(function (ind) {
    parsedByXref[ind.xref] = ind;
    var ex = existingByXref[ind.xref];
    if (ex) {
      indiUpdate++;
      if (sampleUpdate.length < 15) {
        sampleUpdate.push({ xref: ind.xref, nama_lengkap: ind.nama_lengkap, id_anggota: ex.id_anggota });
      }
    } else {
      indiBaru++;
      if (sampleBaru.length < 15) {
        sampleBaru.push({
          xref: ind.xref,
          nama_lengkap: ind.nama_lengkap,
          jenis_kelamin: ind.jenis_kelamin,
          tgl_lahir: ind.tgl_lahir
        });
      }
    }
  });

  var famBaru = 0;
  var famExisting = 0;
  var seenPair = {};
  parsed.families.forEach(function (fam) {
    if (!fam.husb_xref || !fam.wife_xref) return;
    var hEx = existingByXref[fam.husb_xref];
    var wEx = existingByXref[fam.wife_xref];
    if (hEx && wEx && marriageSet[hEx.id_anggota + '|' + wEx.id_anggota]) {
      famExisting++;
      return;
    }
    var hRec = parsedByXref[fam.husb_xref] || hEx;
    var wRec = parsedByXref[fam.wife_xref] || wEx;
    if (hRec && wRec && hRec.jenis_kelamin === 'L' && wRec.jenis_kelamin === 'P') {
      var pk = fam.husb_xref + '|' + fam.wife_xref;
      if (!seenPair[pk]) {
        seenPair[pk] = true;
        famBaru++;
      } else {
        famExisting++;
      }
    }
  });

  return {
    total_indi: parsed.individuals.length,
    anggota_baru: indiBaru,
    anggota_update: indiUpdate,
    total_fam: parsed.families.length,
    pernikahan_baru: famBaru,
    pernikahan_existing: famExisting,
    warnings: parsed.warnings.slice(0, 50),
    sample_baru: sampleBaru,
    sample_update: sampleUpdate
  };
}

/** Handler `gedcom.import` (Admin, LockService): impor massal aman & idempoten. */
function Gedcom_import_(ctx, p) {
  var mode = p.mode === 'insert_only' ? 'insert_only' : 'merge';
  var parsed = parseGedcom_(p.content);
  var idx = loadIndex_();
  var existingByXref = gedcomExistingXrefMap_(idx);
  var warnings = parsed.warnings.slice();
  var now = nowIso_();

  var kodeSet = {};
  idx.anggota.forEach(function (a) { if (a.kode_unik) kodeSet[a.kode_unik] = true; });

  var xrefToRow = {};
  Object.keys(existingByXref).forEach(function (xr) { xrefToRow[xr] = existingByXref[xr]; });

  // --- Tahap 1: Upsert Data_Anggota
  var toInsertAnggota = [];
  var toUpdateAnggota = [];

  parsed.individuals.forEach(function (ind) {
    var existing = existingByXref[ind.xref];
    if (existing) {
      if (mode !== 'merge') return;
      var changed = false;
      if (ind.nama_lengkap && ind.nama_lengkap !== existing.nama_lengkap) {
        existing.nama_lengkap = ind.nama_lengkap;
        changed = true;
      }
      if (ind.tgl_lahir && ind.tgl_lahir !== existing.tgl_lahir) {
        existing.tgl_lahir = ind.tgl_lahir;
        changed = true;
      }
      if (ind.status_hidup !== existing.status_hidup) {
        existing.status_hidup = ind.status_hidup;
        changed = true;
      }
      if (ind.status_anak === 'Angkat' && existing.status_anak !== 'Angkat') {
        existing.status_anak = 'Angkat';
        changed = true;
      }
      if (ind.domisili && ind.domisili !== existing.domisili) {
        existing.domisili = ind.domisili;
        changed = true;
      }
      if (ind.no_wa && ind.no_wa !== existing.no_wa) {
        existing.no_wa = ind.no_wa;
        changed = true;
      }
      if (changed) {
        existing.updated_at = now;
        toUpdateAnggota.push(existing);
      }
      return;
    }

    var kode = generateKodeUnik_(kodeSet);
    kodeSet[kode] = true;
    toInsertAnggota.push({
      id_anggota: Utilities.getUuid(),
      kode_unik: kode,
      gedcom_xref_id: ind.xref,
      nama_lengkap: ind.nama_lengkap,
      jenis_kelamin: ind.jenis_kelamin,
      tgl_lahir: ind.tgl_lahir || '',
      status_hidup: ind.status_hidup,
      urutan_anak: null,
      status_anak: ind.status_anak || 'Kandung',
      domisili: ind.domisili || '',
      no_wa: ind.no_wa || '',
      foto_file_id: '',
      id_ayah: '',
      id_ibu: '',
      id_pernikahan_ortu: '',
      is_deleted: false,
      updated_at: now
    });
  });

  var createdAnggota = Db.insertMany(SHEET.ANGGOTA, toInsertAnggota);
  createdAnggota.forEach(function (r) {
    idx.anggota.push(r);
    idx.anggotaById[r.id_anggota] = r;
    xrefToRow[String(r.gedcom_xref_id).toUpperCase()] = r;
  });
  if (toUpdateAnggota.length) Db.writeRows(SHEET.ANGGOTA, toUpdateAnggota);

  // --- Tahap 2: Insert Data_Pernikahan
  var marriageLookup = gedcomMarriageSet_(idx);
  var maxSpouseOrder = {};
  idx.pernikahan.forEach(function (m) {
    if (!m.is_deleted && m.id_suami) {
      maxSpouseOrder[m.id_suami] = Math.max(maxSpouseOrder[m.id_suami] || 0, Number(m.urutan_pasangan || 0));
    }
  });

  var toInsertPernikahan = [];
  parsed.families.forEach(function (fam) {
    var husb = fam.husb_xref ? xrefToRow[fam.husb_xref] : null;
    var wife = fam.wife_xref ? xrefToRow[fam.wife_xref] : null;
    if (!husb || !wife) return;
    if (husb.id_anggota === wife.id_anggota) {
      warnings.push({ xref: fam.xref, code: 'SELF_MARRIAGE' });
      return;
    }
    if (husb.jenis_kelamin !== 'L' || wife.jenis_kelamin !== 'P') {
      warnings.push({ xref: fam.xref, code: 'INVALID_SPOUSE_GENDER' });
      return;
    }
    var pairKey = husb.id_anggota + '|' + wife.id_anggota;
    if (marriageLookup[pairKey]) return;

    var st = fam.divorced ? 'Cerai' : ((!husb.status_hidup || !wife.status_hidup) ? 'Wafat' : 'Aktif');
    var ord = (maxSpouseOrder[husb.id_anggota] || 0) + 1;
    maxSpouseOrder[husb.id_anggota] = ord;

    var mId = Utilities.getUuid();
    marriageLookup[pairKey] = mId;
    toInsertPernikahan.push({
      id_pernikahan: mId,
      id_suami: husb.id_anggota,
      id_istri: wife.id_anggota,
      status_pernikahan: st,
      urutan_pasangan: ord,
      is_deleted: false,
      updated_at: now
    });
  });

  var createdPernikahan = Db.insertMany(SHEET.PERNIKAHAN, toInsertPernikahan);
  createdPernikahan.forEach(function (r) {
    idx.pernikahan.push(r);
    idx.pernikahanById[r.id_pernikahan] = r;
  });

  // --- Tahap 3: Tautkan garis keturunan (dengan Cycle Detection per tautan)
  var lineageDirty = {};
  parsed.families.forEach(function (fam) {
    var husb = fam.husb_xref ? xrefToRow[fam.husb_xref] : null;
    var wife = fam.wife_xref ? xrefToRow[fam.wife_xref] : null;
    if (husb && husb.jenis_kelamin !== 'L') husb = null;
    if (wife && wife.jenis_kelamin !== 'P') wife = null;
    var mId = (husb && wife) ? (marriageLookup[husb.id_anggota + '|' + wife.id_anggota] || '') : '';

    fam.chil_xrefs.forEach(function (cRef, cIdx) {
      var child = xrefToRow[cRef.xref];
      if (!child) return;

      var ayahId = husb && husb.id_anggota !== child.id_anggota ? husb.id_anggota : '';
      var ibuId = wife && wife.id_anggota !== child.id_anggota ? wife.id_anggota : '';

      if (ayahId && Nasab.isDescendant(idx.anggota, child.id_anggota, ayahId)) {
        warnings.push({ xref: cRef.xref, code: 'CYCLE_DETECTED' });
        ayahId = '';
      }
      if (ibuId && Nasab.isDescendant(idx.anggota, child.id_anggota, ibuId)) {
        warnings.push({ xref: cRef.xref, code: 'CYCLE_DETECTED' });
        ibuId = '';
      }

      var changed = false;
      if (ayahId && (mode === 'merge' || !child.id_ayah) && child.id_ayah !== ayahId) {
        child.id_ayah = ayahId;
        changed = true;
      }
      if (ibuId && (mode === 'merge' || !child.id_ibu) && child.id_ibu !== ibuId) {
        child.id_ibu = ibuId;
        changed = true;
      }
      var effMarriageId = (child.id_ayah && child.id_ibu && mId) ? mId : '';
      if (effMarriageId && child.id_pernikahan_ortu !== effMarriageId) {
        child.id_pernikahan_ortu = effMarriageId;
        changed = true;
      }
      if (!child.urutan_anak) {
        child.urutan_anak = cIdx + 1;
        changed = true;
      }
      if (cRef.adopted && child.status_anak !== 'Angkat') {
        child.status_anak = 'Angkat';
        changed = true;
      }
      if (changed) {
        child.updated_at = now;
        lineageDirty[child.id_anggota] = child;
      }
    });
  });

  var lineageRows = Object.keys(lineageDirty).map(function (id) { return lineageDirty[id]; });
  if (lineageRows.length) Db.writeRows(SHEET.ANGGOTA, lineageRows);

  logActivity_(ctx, 'IMPORT_GEDCOM', 'GEDCOM', {
    mode: mode,
    anggota_baru: createdAnggota.length,
    anggota_update: toUpdateAnggota.length,
    pernikahan_baru: createdPernikahan.length,
    lineage_linked: lineageRows.length
  });

  return {
    anggota_baru: createdAnggota.length,
    anggota_update: toUpdateAnggota.length,
    pernikahan_baru: createdPernikahan.length,
    lineage_linked: lineageRows.length,
    warnings: warnings.slice(0, 50)
  };
}
