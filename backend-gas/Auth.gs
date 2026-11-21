/**
 * Auth.gs — Login, hashing password (PBKDF2-HMAC-SHA256 + salt + pepper),
 * token sesi bertanda tangan HMAC, dan verifikasi sesi di setiap endpoint.
 *
 * Format hash : pbkdf2_sha256$<iterasi>$<salt_b64>$<hash_b64>
 * Format token: v1.<claims_b64url>.<hmac_b64url>
 *   claims = { sub: id_user, tv: token_version, iat, exp, rm }
 * Pencabutan sesi: menaikkan `token_version` di Data_Pengguna.
 */

var HMAC_ALG_ = function () { return Utilities.MacAlgorithm.HMAC_SHA_256; };

/** Hash dummy (format valid) untuk menyamakan waktu respons saat username tidak ada. */
var DUMMY_HASH_ = 'pbkdf2_sha256$4096$c2FsdHNhbHRzYWx0c2FsdA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/* =========================================================================
 * Rahasia (PropertiesService)
 * ========================================================================= */
function getSecret_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Rahasia belum diinisialisasi: jalankan setupSheets()');
  return v;
}

/** Dipanggil dari setupSheets(): membuat rahasia acak bila belum ada. */
function ensureSecret_(key) {
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty(key);
  if (!v) {
    v = Utilities.base64Encode(randomBytes_(48));
    props.setProperty(key, v);
  }
  return v;
}

/* =========================================================================
 * Password
 * ========================================================================= */

/** PBKDF2-HMAC-SHA256, 1 blok (dkLen = 32 byte). Byte[] masuk, Byte[] keluar. */
function pbkdf2_(passwordBytes, saltBytes, iterations) {
  var alg = HMAC_ALG_();
  var u = Utilities.computeHmacSignature(alg, saltBytes.concat([0, 0, 0, 1]), passwordBytes);
  var out = u.slice();
  for (var i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSignature(alg, u, passwordBytes);
    for (var j = 0; j < out.length; j++) out[j] ^= u[j];
  }
  return out;
}

/** Pepper: HMAC(password, pepper) — pepper hanya ada di Script Properties. */
function pepperedBytes_(plain) {
  var pepper = getSecret_(PROP.PASSWORD_PEPPER);
  return Utilities.computeHmacSignature(
    HMAC_ALG_(),
    Utilities.newBlob(String(plain)).getBytes(),
    Utilities.newBlob(pepper).getBytes()
  );
}

function hashPassword_(plain) {
  var salt = randomBytes_(16);
  var iter = APP.PBKDF2_ITERATIONS;
  var dk = pbkdf2_(pepperedBytes_(plain), salt, iter);
  return ['pbkdf2_sha256', iter, Utilities.base64Encode(salt), Utilities.base64Encode(dk)].join('$');
}

function verifyPassword_(plain, stored) {
  try {
    var parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    var iter = Number(parts[1]);
    if (!(iter >= 1000 && iter <= 200000)) return false;
    var salt = Utilities.base64Decode(parts[2]);
    var dk = pbkdf2_(pepperedBytes_(plain), salt, iter);
    return constantTimeEquals_(Utilities.base64Encode(dk), parts[3]);
  } catch (e) {
    return false;
  }
}

/* =========================================================================
 * Token sesi
 * ========================================================================= */
function signToken_(data) {
  return b64urlEncode_(Utilities.computeHmacSha256Signature(data, getSecret_(PROP.SESSION_SECRET)));
}

function issueToken_(user, remember) {
  var now = Date.now();
  var claims = {
    sub: user.id_user,
    tv: Number(user.token_version || 0),
    iat: now,
    exp: now + (remember ? APP.SESSION_TTL_REMEMBER_MS : APP.SESSION_TTL_MS),
    rm: remember ? 1 : 0
  };
  var head = APP.TOKEN_PREFIX + '.' + b64urlEncode_(JSON.stringify(claims));
  return { token: head + '.' + signToken_(head), expires_at: new Date(claims.exp).toISOString() };
}

/**
 * Verifikasi token: tanda tangan, kedaluwarsa, user aktif, dan token_version.
 * Dipanggil oleh SETIAP endpoint non-publik (lihat execute_ di Code.gs).
 */
function authenticate_(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 2048) throw ERR.unauthorized();
  var parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== APP.TOKEN_PREFIX) throw ERR.unauthorized();
  var expected = signToken_(parts[0] + '.' + parts[1]);
  if (!constantTimeEquals_(expected, parts[2])) throw ERR.unauthorized();

  var claims;
  try { claims = JSON.parse(b64urlDecodeToString_(parts[1])); } catch (e) { throw ERR.unauthorized(); }
  if (!claims || typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || claims.exp <= Date.now()) {
    throw ERR.unauthorized();
  }
  var user = Db.findOne(SHEET.PENGGUNA, 'id_user', claims.sub);
  if (!user || !user.status_aktif || Number(user.token_version || 0) !== Number(claims.tv)) {
    throw ERR.unauthorized();
  }
  return { user: publicUser_(user), claims: claims };
}

function publicUser_(u) {
  return {
    id_user: u.id_user,
    username: u.username,
    role: ENUM.ROLE.indexOf(u.role) >= 0 ? u.role : 'User',
    id_anggota: u.id_anggota || ''
  };
}

/* =========================================================================
 * Handler
 * ========================================================================= */
function Auth_login_(ctx, p) {
  var username = normalizeUsername_(p.username);
  var password = typeof p.password === 'string' ? p.password : '';
  var remember = p.remember === true;
  if (!username || !password || password.length > APP.PASSWORD_MAX) throw ERR.invalidCredentials();

  var cache = CacheService.getScriptCache();
  var key = 'login_fail_' + sha256Hex_(username);
  var fails = Number(cache.get(key) || 0);
  if (fails >= APP.LOGIN_MAX_ATTEMPTS) throw ERR.tooMany();

  var user = Db.findOne(SHEET.PENGGUNA, 'username', username);
  var ok = verifyPassword_(password, user ? user.password_hash : DUMMY_HASH_);
  if (!user || !ok || !user.status_aktif) {
    cache.put(key, String(fails + 1), APP.LOGIN_LOCK_SECONDS);
    throw ERR.invalidCredentials();
  }
  cache.remove(key);

  var t = issueToken_(user, remember);
  return { token: t.token, expires_at: t.expires_at, user: publicUser_(user) };
}

function Auth_me_(ctx) {
  var anggota = null;
  if (ctx.user.id_anggota) {
    var a = Db.findOne(SHEET.ANGGOTA, 'id_anggota', ctx.user.id_anggota);
    if (a && !a.is_deleted) anggota = Db.plain(SHEET.ANGGOTA, a);
  }
  return { user: ctx.user, anggota: anggota, expires_at: new Date(ctx.claims.exp).toISOString() };
}

function Auth_changePassword_(ctx, p) {
  var row = Db.findOne(SHEET.PENGGUNA, 'id_user', ctx.user.id_user);
  if (!row) throw ERR.unauthorized();
  var oldPw = typeof p.password_lama === 'string' ? p.password_lama : '';
  var newPw = typeof p.password_baru === 'string' ? p.password_baru : '';
  if (!verifyPassword_(oldPw, row.password_hash)) {
    throw new ApiError(400, 'INVALID_OLD_PASSWORD', 'Password lama tidak sesuai.');
  }
  if (!validatePasswordPolicy_(newPw)) throw ERR.validation([{ field: 'password_baru', rule: 'policy' }]);

  Db.update(SHEET.PENGGUNA, row, {
    password_hash: hashPassword_(newPw),
    token_version: Number(row.token_version || 0) + 1
  });
  logActivity_(ctx, 'UPDATE', row.id_user, { entitas: 'pengguna', perubahan: ['password'] });
  var t = issueToken_(row, ctx.claims.rm === 1);
  return { token: t.token, expires_at: t.expires_at, user: publicUser_(row) };
}

/** Keluar dari semua perangkat (mencabut seluruh token aktif user ini). */
function Auth_logoutAll_(ctx) {
  var row = Db.findOne(SHEET.PENGGUNA, 'id_user', ctx.user.id_user);
  if (!row) throw ERR.unauthorized();
  Db.update(SHEET.PENGGUNA, row, { token_version: Number(row.token_version || 0) + 1 });
  return { revoked: true };
}
