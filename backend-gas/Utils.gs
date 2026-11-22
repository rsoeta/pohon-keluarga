/**
 * Utils.gs — Error API, sanitasi (anti-XSS & anti-formula injection),
 * validator, kriptografi ringan, dan helper tanggal.
 */

/* =========================================================================
 * ApiError — error terkontrol yang aman dikirim ke klien (pesan generik).
 * ========================================================================= */
function ApiError(status, code, message, fields) {
  this.name = 'ApiError';
  this.status = status;
  this.code = code;
  this.message = message || code;
  this.fields = fields || null;
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

var ERR = {
  badRequest: function (code, fields) {
    return new ApiError(400, code || 'BAD_REQUEST', 'Permintaan tidak valid.', fields);
  },
  validation: function (fields) {
    return new ApiError(400, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid.', fields);
  },
  unauthorized: function () {
    return new ApiError(401, 'UNAUTHORIZED', 'Sesi tidak valid atau telah berakhir.');
  },
  invalidCredentials: function () {
    return new ApiError(401, 'INVALID_CREDENTIALS', 'Username atau password salah.');
  },
  forbidden: function () {
    return new ApiError(403, 'FORBIDDEN', 'Forbidden');
  },
  notFound: function () {
    return new ApiError(404, 'NOT_FOUND', 'Data tidak ditemukan.');
  },
  conflict: function (code) {
    return new ApiError(409, code || 'CONFLICT', 'Data bertentangan dengan data yang sudah ada.');
  },
  tooLarge: function () {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Ukuran data terlalu besar.');
  },
  tooMany: function () {
    return new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan. Coba lagi nanti.');
  },
  busy: function () {
    return new ApiError(503, 'SERVER_BUSY', 'Server sedang sibuk. Silakan coba lagi.');
  },
  unavailable: function (code) {
    return new ApiError(503, code || 'SERVICE_UNAVAILABLE', 'Layanan belum tersedia.');
  }
};

/* =========================================================================
 * Sanitasi
 * ========================================================================= */

/**
 * Membersihkan teks input pengguna (anti-XSS):
 * - buang karakter kontrol, tag HTML, karakter < >
 * - rapikan spasi, potong sesuai panjang maksimum
 * Perlindungan anti-formula diterapkan terpusat di Db (serialize) agar
 * SEMUA tulisan ke Sheets terlindungi, termasuk dari impor GEDCOM.
 */
function sanitizeText_(value, maxLen, multiline) {
  if (value === null || value === undefined) return '';
  var s = String(value);
  s = s.replace(/<[^>]*>/g, '');           // tag HTML
  s = s.replace(/[<>]/g, '');              // sisa kurung sudut
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, '');
  if (multiline) {
    s = s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ');
  }
  s = s.trim();
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen).trim();
  return s;
}

/** Anti-Formula Injection: awali dengan ' bila diawali = + - @ (juga TAB/CR). */
function guardFormula_(s) {
  if (typeof s !== 'string' || s === '') return s;
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** Kebalikan guardFormula_ saat membaca dari sheet. */
function unguardFormula_(s) {
  if (typeof s !== 'string') return s;
  return /^'[=+\-@\t\r]/.test(s) ? s.substring(1) : s;
}

/* =========================================================================
 * Validator & normalisasi
 * ========================================================================= */
var UUID_RE_ = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid_(v) {
  return typeof v === 'string' && UUID_RE_.test(v);
}

function hasOwn_(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/** Boolean ketat: true/false/'true'/'false'/'TRUE'/1/0. */
function toBool_(v) {
  if (v === true || v === false) return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    var s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'ya' || s === 'yes';
  }
  return false;
}

function isBoolLike_(v) {
  if (v === true || v === false) return true;
  if (typeof v === 'string') return /^(true|false)$/i.test(v.trim());
  return false;
}

/** Normalisasi tanggal lahir: '' | 'YYYY' | 'YYYY-MM-DD'. Mengembalikan null bila tidak valid. */
function normalizeTglLahir_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  if (s === '') return '';
  var today = todayString_();
  var thisYear = Number(today.substring(0, 4));
  if (/^\d{4}$/.test(s)) {
    var y = Number(s);
    return (y >= 1000 && y <= thisYear) ? s : null;
  }
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  var yy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
  if (yy < 1000 || mm < 1 || mm > 12 || dd < 1) return null;
  if (dd > daysInMonth_(yy, mm)) return null;
  if (s > today) return null;
  return s;
}

/** Normalisasi nomor WhatsApp ke format internasional digit (62xxxxxxxx). null = tidak valid. */
function normalizePhone_(v) {
  if (v === null || v === undefined) return '';
  var raw = String(v).trim();
  if (raw === '') return '';
  var d = raw.replace(/[^\d]/g, '');
  if (d.indexOf('00') === 0) d = d.substring(2);
  else if (d.indexOf('0') === 0) d = '62' + d.substring(1);
  else if (d.indexOf('8') === 0) d = '62' + d;
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function normalizeUsername_(v) {
  if (typeof v !== 'string') return '';
  var s = v.trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(s) ? s : '';
}

/** Normalisasi email: '' bila kosong; null bila format tidak valid. */
function normalizeEmail_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return null;
  var s = v.trim().toLowerCase();
  if (s === '') return '';
  if (s.length > 160 || /[<>'"\s]/.test(s) || /[\u0000-\u001F\u007F]/.test(s)) return null;
  var re = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  return re.test(s) ? s : null;
}

/** Normalisasi daftar hostname Turnstile (dipisah koma): '' bila kosong; null bila tidak valid. */
function normalizeHostnameList_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return null;
  var trimmed = v.trim();
  if (!trimmed) return '';
  var parts = trimmed.split(',');
  var out = [];
  var seen = {};
  var hostRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
  for (var i = 0; i < parts.length; i++) {
    var h = parts[i].trim().toLowerCase();
    if (!h) continue;
    if (!hostRe.test(h)) return null;
    if (!seen[h]) {
      seen[h] = true;
      out.push(h);
    }
  }
  var joined = out.join(',');
  return joined.length > 500 ? null : joined;
}

/** Membuat username unik & valid dari local-part email untuk auto-provisioning OAuth. */
function deriveUniqueUsername_(email, existingUsers) {
  var taken = {};
  (existingUsers || []).forEach(function (u) {
    if (u && u.username) taken[String(u.username).trim().toLowerCase()] = true;
  });
  var local = String(email || '').split('@')[0].toLowerCase();
  var base = local
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (base.length < 3) base = (base + 'user').substring(0, 12);
  if (base.length > 26) base = base.substring(0, 26);
  if (!taken[base] && normalizeUsername_(base)) return base;
  for (var n = 2; n < 10000; n++) {
    var cand = base.substring(0, 26) + '_' + n;
    if (!taken[cand] && normalizeUsername_(cand)) return cand;
  }
  return 'user_' + sha256Hex_(email + ':' + Date.now()).substring(0, 12);
}

function validatePasswordPolicy_(pw) {
  if (typeof pw !== 'string') return false;
  if (pw.length < APP.PASSWORD_MIN || pw.length > APP.PASSWORD_MAX) return false;
  return /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

function optionalUuidField_(input, field, errors) {
  var v = input[field];
  if (v === undefined || v === null || v === '') return '';
  if (!isUuid_(String(v))) {
    errors.push({ field: field, rule: 'uuid' });
    return '';
  }
  return String(v).toLowerCase();
}

/** Validasi URL eksternal wajib HTTPS & bebas target privat/loopback/metadata (anti-SSRF). */
function isSafeHttpsUrl_(url) {
  if (typeof url !== 'string') return false;
  var s = url.trim();
  if (!s || s.length > 250 || /\s/.test(s)) return false;
  var m = /^https:\/\/([^\/?#]+)(?:[\/?#]|$)/i.exec(s);
  if (!m) return false;
  var authority = m[1].toLowerCase();
  if (authority.indexOf('@') !== -1) return false;
  if (authority.charAt(0) === '[') return false;
  var host = authority.split(':')[0];
  if (!host || host.indexOf('.') === -1) return false;
  if (host === 'localhost' || /\.(local|internal|localhost)$/i.test(host)) return false;
  var ip4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ip4) {
    var a = Number(ip4[1]), b = Number(ip4[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

/* =========================================================================
 * Tanggal
 * ========================================================================= */
function nowIso_() {
  return new Date().toISOString();
}

function todayString_() {
  return Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd');
}

function isLeapYear_(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth_(y, m) {
  return [31, isLeapYear_(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/* =========================================================================
 * Kriptografi & acak
 * ========================================================================= */

/** Byte acak berbasis UUID v4 (SecureRandom di server Google) + SHA-256. */
function randomBytes_(n) {
  var out = [];
  while (out.length < n) {
    out = out.concat(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now()
    ));
  }
  return out.slice(0, n);
}

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

function b64urlEncode_(data) {
  return Utilities.base64EncodeWebSafe(data).replace(/=+$/, '');
}

function b64urlDecodeToString_(s) {
  var pad = s.length % 4 ? '===='.substring(s.length % 4) : '';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s + pad)).getDataAsString();
}

/** Perbandingan string waktu-konstan (mencegah timing attack). */
function constantTimeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false; // panjang HMAC/hash bukan rahasia
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Kode unik 5 huruf (mis. IWRPQ) menggunakan byte acak. */
function generateKodeUnik_(existingSet) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (var attempt = 0; attempt < 50; attempt++) {
    var bytes = randomBytes_(5);
    var code = bytes.map(function (b) { return alphabet.charAt((b & 0xff) % 26); }).join('');
    if (!existingSet[code]) return code;
  }
  throw new Error('Gagal membuat kode unik');
}

/* =========================================================================
 * Output
 * ========================================================================= */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function pick_(obj, keys) {
  var out = {};
  keys.forEach(function (k) { out[k] = obj[k]; });
  return out;
}
