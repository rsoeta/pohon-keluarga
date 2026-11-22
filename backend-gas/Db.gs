/**
 * Db.gs — Lapisan akses Google Sheets (repository sederhana).
 *
 * - Membaca sheet berdasarkan NAMA HEADER (tahan terhadap perubahan urutan kolom).
 * - Serialisasi terpusat: setiap kolom bertipe teks otomatis dilindungi
 *   Anti-Formula Injection sebelum ditulis.
 * - Cache per-eksekusi. Semua operasi tulis HARUS dipanggil di dalam
 *   withScriptLock_() (lihat Code.gs).
 */
var Db = (function () {
  var ss_ = null;
  var tables_ = {};

  function spreadsheet() {
    if (ss_) return ss_;
    var id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
    ss_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss_) throw new Error('Spreadsheet belum dikonfigurasi. Jalankan setupSheets().');
    return ss_;
  }

  function types_(name) {
    var cols = SCHEMA[name];
    if (!cols) throw new Error('Skema tidak dikenal: ' + name);
    var m = {};
    cols.forEach(function (c) { m[c[0]] = c[1]; });
    return m;
  }

  function deserialize_(type, v) {
    if (type === 'bool') return toBool_(v);
    if (type === 'int') {
      if (v === '' || v === null || v === undefined) return null;
      var n = Number(v);
      return isFinite(n) ? Math.trunc(n) : null;
    }
    if (type === 'date') {
      if (v instanceof Date) return Utilities.formatDate(v, APP.TIMEZONE, 'yyyy-MM-dd');
      if (typeof v === 'number') return String(Math.trunc(v));
      return unguardFormula_(String(v === null || v === undefined ? '' : v)).trim();
    }
    if (v instanceof Date) return v.toISOString();
    return unguardFormula_(String(v === null || v === undefined ? '' : v));
  }

  function serialize_(type, v) {
    if (type === 'bool') return toBool_(v);
    if (type === 'int') {
      if (v === null || v === undefined || v === '') return '';
      var n = Number(v);
      return isFinite(n) ? Math.trunc(n) : '';
    }
    return guardFormula_(v === null || v === undefined ? '' : String(v));
  }

  function hydrate_(t, raw, rowNumber) {
    var o = {};
    var seen = {};
    for (var j = 0; j < t.headers.length; j++) {
      var h = t.headers[j];
      if (t.types[h]) {
        o[h] = deserialize_(t.types[h], raw[j]);
        seen[h] = true;
      }
    }
    Object.keys(t.types).forEach(function (col) {
      if (!seen[col]) o[col] = deserialize_(t.types[col], '');
    });
    Object.defineProperty(o, '__row', { value: rowNumber, writable: true, enumerable: false });
    Object.defineProperty(o, '__raw', { value: raw.slice(), writable: true, enumerable: false });
    return o;
  }

  function toRow_(t, obj, raw) {
    return t.headers.map(function (h, j) {
      if (t.types[h]) return serialize_(t.types[h], obj[h]);
      return raw ? raw[j] : '';
    });
  }

  function formats_(t) {
    return t.headers.map(function (h) {
      var ty = t.types[h];
      return (ty === 'bool' || ty === 'int') ? '0' : '@';
    });
  }

  function table(name) {
    if (tables_[name]) return tables_[name];
    var sh = spreadsheet().getSheetByName(name);
    if (!sh) throw new Error('Sheet tidak ditemukan: ' + name);
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) throw new Error('Header sheet kosong: ' + name);
    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = values[0].map(function (h) { return String(h).trim(); });
    var types = types_(name);
    var optionalCols = (typeof OPTIONAL_SCHEMA_COLS !== 'undefined' && OPTIONAL_SCHEMA_COLS[name]) || [];
    Object.keys(types).forEach(function (col) {
      if (headers.indexOf(col) === -1 && optionalCols.indexOf(col) === -1) {
        throw new Error('Kolom hilang di ' + name + ': ' + col);
      }
    });
    var t = { name: name, sheet: sh, headers: headers, types: types, rows: [] };
    for (var i = 1; i < values.length; i++) {
      var raw = values[i];
      var empty = true;
      for (var k = 0; k < raw.length; k++) {
        if (raw[k] !== '' && raw[k] !== null) { empty = false; break; }
      }
      if (!empty) t.rows.push(hydrate_(t, raw, i + 1));
    }
    tables_[name] = t;
    return t;
  }

  function rows(name) {
    return table(name).rows;
  }

  function findOne(name, field, value) {
    var r = table(name).rows;
    for (var i = 0; i < r.length; i++) if (r[i][field] === value) return r[i];
    return null;
  }

  function indexBy(name, field) {
    var m = {};
    table(name).rows.forEach(function (r) { if (r[field] !== '' && r[field] !== null) m[r[field]] = r; });
    return m;
  }

  function ensureMissingOptionalCols_(t) {
    var missing = Object.keys(t.types).filter(function (col) {
      return t.headers.indexOf(col) === -1;
    });
    if (!missing.length) return;
    var startCol = t.headers.length + 1;
    t.sheet
      .getRange(1, startCol, 1, missing.length)
      .setValues([missing])
      .setFontWeight('bold')
      .setBackground('#1e3a5f')
      .setFontColor('#ffffff');
    missing.forEach(function (col) {
      t.headers.push(col);
    });
    t.rows.forEach(function (r) {
      if (r.__raw) {
        while (r.__raw.length < t.headers.length) r.__raw.push('');
      }
    });
  }

  function insertMany(name, objs) {
    if (!objs || !objs.length) return [];
    var t = table(name);
    ensureMissingOptionalCols_(t);
    var sh = t.sheet;
    var start = Math.max(sh.getLastRow(), 1) + 1;
    var need = start + objs.length - 1 - sh.getMaxRows();
    if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
    var data = objs.map(function (o) { return toRow_(t, o, null); });
    var fmt = formats_(t);
    var range = sh.getRange(start, 1, data.length, t.headers.length);
    range.setNumberFormats(data.map(function () { return fmt; }));
    range.setValues(data);
    var created = data.map(function (row, k) { return hydrate_(t, row, start + k); });
    created.forEach(function (r) { t.rows.push(r); });
    return created;
  }

  function insert(name, obj) {
    return insertMany(name, [obj])[0];
  }

  /** Menerapkan perubahan ke objek baris (hasil table()) lalu menulis 1 baris. */
  function update(name, row, changes) {
    var t = table(name);
    ensureMissingOptionalCols_(t);
    if (!row || !row.__row) throw new Error('Baris tidak valid untuk update');
    Object.keys(changes || {}).forEach(function (k) { if (t.types[k]) row[k] = changes[k]; });
    var data = toRow_(t, row, row.__raw);
    var range = t.sheet.getRange(row.__row, 1, 1, t.headers.length);
    range.setNumberFormats([formats_(t)]);
    range.setValues([data]);
    row.__raw = data;
    t.headers.forEach(function (h, j) { if (t.types[h]) row[h] = deserialize_(t.types[h], data[j]); });
    return row;
  }

  /** Menulis ulang banyak baris (sudah dimodifikasi di memori) dalam blok bersebelahan. */
  function writeRows(name, rowObjs) {
    if (!rowObjs || !rowObjs.length) return;
    var t = table(name);
    ensureMissingOptionalCols_(t);
    var sorted = rowObjs.slice().sort(function (a, b) { return a.__row - b.__row; });
    var fmt = formats_(t);
    var block = [];
    var flush = function () {
      if (!block.length) return;
      var data = block.map(function (r) { return toRow_(t, r, r.__raw); });
      var range = t.sheet.getRange(block[0].__row, 1, data.length, t.headers.length);
      range.setNumberFormats(data.map(function () { return fmt; }));
      range.setValues(data);
      block.forEach(function (r, k) { r.__raw = data[k]; });
      block = [];
    };
    sorted.forEach(function (r) {
      if (block.length && r.__row !== block[block.length - 1].__row + 1) flush();
      block.push(r);
    });
    flush();
  }

  function clearCache() {
    tables_ = {};
  }

  /** Objek polos (tanpa properti internal) dari baris. */
  function plain(name, row) {
    var out = {};
    SCHEMA[name].forEach(function (c) { out[c[0]] = row[c[0]]; });
    return out;
  }

  return {
    spreadsheet: spreadsheet,
    table: table,
    rows: rows,
    findOne: findOne,
    indexBy: indexBy,
    insert: insert,
    insertMany: insertMany,
    update: update,
    writeRows: writeRows,
    clearCache: clearCache,
    plain: plain
  };
})();
