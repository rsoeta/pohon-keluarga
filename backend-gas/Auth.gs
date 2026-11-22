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

function getAuthConfigInternal_() {
  var props = PropertiesService.getScriptProperties();
  return {
    turnstileSiteKey: (props.getProperty(PROP.TURNSTILE_SITE_KEY) || '').trim(),
    turnstileSecretKey: (props.getProperty(PROP.TURNSTILE_SECRET_KEY) || '').trim(),
    turnstileAllowedHostnames: (props.getProperty(PROP.TURNSTILE_ALLOWED_HOSTNAMES) || '').trim().toLowerCase(),
    googleClientId: (props.getProperty(PROP.GOOGLE_CLIENT_ID) || '').trim()
  };
}

function Auth_config_() {
  var cfg = getAuthConfigInternal_();
  var turnstileEnabled = !!(cfg.turnstileSiteKey && cfg.turnstileSecretKey);
  return {
    turnstile_enabled: turnstileEnabled,
    turnstile_site_key: turnstileEnabled ? cfg.turnstileSiteKey : '',
    google_oauth_enabled: !!cfg.googleClientId,
    google_client_id: cfg.googleClientId || ''
  };
}

function hasLocalPassword_(u) {
  return String((u && u.password_hash) || '').indexOf('pbkdf2_sha256$') === 0;
}

function publicUser_(u) {
  return {
    id_user: u.id_user,
    username: u.username,
    email: u.email || '',
    has_password: hasLocalPassword_(u),
    role: ENUM.ROLE.indexOf(u.role) >= 0 ? u.role : 'User',
    id_anggota: u.id_anggota || ''
  };
}

function verifyTurnstileToken_(token) {
  var cfg = getAuthConfigInternal_();
  if (!cfg.turnstileSecretKey) return { skipped: true };

  if (typeof token !== 'string' || !token.trim() || token.length > 4096) {
    throw new ApiError(400, 'TURNSTILE_REQUIRED', 'Verifikasi keamanan Cloudflare Turnstile wajib diselesaikan.');
  }

  var resp;
  try {
    resp = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post',
      payload: {
        secret: cfg.turnstileSecretKey,
        response: token.trim()
      },
      muteHttpExceptions: true
    });
  } catch (e) {
    throw new ApiError(400, 'TURNSTILE_FAILED', 'Verifikasi keamanan gagal atau kedaluwarsa. Silakan coba lagi.');
  }

  if (!resp || resp.getResponseCode() !== 200) {
    throw new ApiError(400, 'TURNSTILE_FAILED', 'Verifikasi keamanan gagal atau kedaluwarsa. Silakan coba lagi.');
  }

  var data;
  try {
    data = JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    throw new ApiError(400, 'TURNSTILE_FAILED', 'Verifikasi keamanan gagal atau kedaluwarsa. Silakan coba lagi.');
  }

  if (!data || data.success !== true) {
    throw new ApiError(400, 'TURNSTILE_FAILED', 'Verifikasi keamanan gagal atau kedaluwarsa. Silakan coba lagi.');
  }

  if (cfg.turnstileAllowedHostnames) {
    var allowed = cfg.turnstileAllowedHostnames.split(',').filter(Boolean);
    var host = String(data.hostname || '').trim().toLowerCase();
    if (!host || allowed.indexOf(host) === -1) {
      throw new ApiError(400, 'TURNSTILE_FAILED', 'Verifikasi keamanan gagal atau kedaluwarsa. Silakan coba lagi.');
    }
  }

  return { ok: true, hostname: data.hostname || '' };
}

function verifyGoogleIdToken_(credential, expectedClientId) {
  if (typeof credential !== 'string' || credential.length < 100 || credential.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credential)) {
    throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Token login Google tidak valid.');
  }

  var resp;
  try {
    resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { muteHttpExceptions: true }
    );
  } catch (e) {
    throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Token login Google tidak valid.');
  }

  if (!resp || resp.getResponseCode() !== 200) {
    throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Token login Google tidak valid.');
  }

  var info;
  try {
    info = JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Token login Google tidak valid.');
  }

  var issOk = info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com';
  var verifiedOk = info.email_verified === true || info.email_verified === 'true';
  var expMs = Number(info.exp) * 1000;
  var email = normalizeEmail_(info.email);

  if (!info ||
      !constantTimeEquals_(String(info.aud || ''), expectedClientId) ||
      !issOk ||
      !verifiedOk ||
      !isFinite(expMs) ||
      expMs <= Date.now() ||
      !email) {
    throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Token login Google tidak valid.');
  }

  return { email: email, sub: String(info.sub || '') };
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

  verifyTurnstileToken_(p.turnstile_token);

  var user = Db.findOne(SHEET.PENGGUNA, 'username', username);
  var canUsePassword = !!(user && hasLocalPassword_(user));
  var ok = verifyPassword_(password, canUsePassword ? user.password_hash : DUMMY_HASH_);
  if (!user || !canUsePassword || !ok || !user.status_aktif) {
    cache.put(key, String(fails + 1), APP.LOGIN_LOCK_SECONDS);
    throw ERR.invalidCredentials();
  }
  cache.remove(key);

  var t = issueToken_(user, remember);
  return { token: t.token, expires_at: t.expires_at, user: publicUser_(user) };
}

function Auth_googleLogin_(ctx, p) {
  var cfg = getAuthConfigInternal_();
  if (!cfg.googleClientId) throw ERR.unavailable('GOOGLE_AUTH_NOT_CONFIGURED');

  var remember = p.remember === true;
  var info = verifyGoogleIdToken_(p.credential, cfg.googleClientId);
  var email = info.email;

  var cache = CacheService.getScriptCache();
  var key = 'glogin_fail_' + sha256Hex_(email);
  var fails = Number(cache.get(key) || 0);
  if (fails >= APP.LOGIN_MAX_ATTEMPTS) throw ERR.tooMany();

  var users = Db.rows(SHEET.PENGGUNA);
  var matchedUser = null;
  for (var i = 0; i < users.length; i++) {
    if (normalizeEmail_(users[i].email) === email) {
      matchedUser = users[i];
      if (users[i].status_aktif) break;
    }
  }

  if (matchedUser) {
    if (!matchedUser.status_aktif) {
      throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Akun pengguna dinonaktifkan oleh Administrator.');
    }
    cache.remove(key);
    var tExisting = issueToken_(matchedUser, remember);
    return { token: tExisting.token, expires_at: tExisting.expires_at, user: publicUser_(matchedUser) };
  }

  var anggotaRows = Db.rows(SHEET.ANGGOTA);
  var matchedAnggota = null;
  for (var j = 0; j < anggotaRows.length; j++) {
    if (!anggotaRows[j].is_deleted && normalizeEmail_(anggotaRows[j].email) === email) {
      matchedAnggota = anggotaRows[j];
      break;
    }
  }

  if (!matchedAnggota) {
    cache.put(key, String(fails + 1), APP.LOGIN_LOCK_SECONDS);
    throw new ApiError(403, 'EMAIL_NOT_WHITELISTED', 'Email Google Anda belum terdaftar dalam whitelist keluarga.');
  }

  var activeLinked = null;
  var inactiveLinked = null;
  for (var k = 0; k < users.length; k++) {
    if (users[k].id_anggota === matchedAnggota.id_anggota) {
      if (users[k].status_aktif) {
        activeLinked = users[k];
        break;
      } else if (!inactiveLinked) {
        inactiveLinked = users[k];
      }
    }
  }
  var linkedUser = activeLinked || inactiveLinked;

  if (linkedUser) {
    if (!linkedUser.status_aktif) {
      throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Akun pengguna dinonaktifkan oleh Administrator.');
    }
    var linkedEmail = normalizeEmail_(linkedUser.email);
    if (linkedEmail && linkedEmail !== email) {
      cache.put(key, String(fails + 1), APP.LOGIN_LOCK_SECONDS);
      throw new ApiError(403, 'EMAIL_NOT_WHITELISTED', 'Email Google Anda belum terdaftar dalam whitelist keluarga.');
    }
    cache.remove(key);
    var tLinked = issueToken_(linkedUser, remember);
    return { token: tLinked.token, expires_at: tLinked.expires_at, user: publicUser_(linkedUser) };
  }

  var created = Db.insert(SHEET.PENGGUNA, {
    id_user: Utilities.getUuid(),
    username: deriveUniqueUsername_(email, users),
    password_hash: '',
    id_anggota: matchedAnggota.id_anggota,
    role: 'User',
    status_aktif: true,
    token_version: 1,
    email: email
  });
  logActivity_({ user: publicUser_(created) }, 'CREATE', created.id_user, {
    entitas: 'pengguna',
    sumber: 'google_oauth',
    id_anggota: matchedAnggota.id_anggota
  });
  cache.remove(key);
  var tCreated = issueToken_(created, remember);
  return { token: tCreated.token, expires_at: tCreated.expires_at, user: publicUser_(created) };
}

function Auth_me_(ctx) {
  var anggota = null;
  if (ctx.user.id_anggota) {
    var a = Db.findOne(SHEET.ANGGOTA, 'id_anggota', ctx.user.id_anggota);
    if (a && !a.is_deleted) anggota = Db.plain(SHEET.ANGGOTA, a);
  }
  return { user: ctx.user, anggota: anggota, expires_at: new Date(ctx.claims.exp).toISOString() };
}

function Auth_updateEmail_(ctx, p) {
  var row = Db.findOne(SHEET.PENGGUNA, 'id_user', ctx.user.id_user);
  if (!row) throw ERR.unauthorized();

  var nextEmail = normalizeEmail_(hasOwn_(p, 'email') ? p.email : '');
  if (nextEmail === null) throw ERR.validation([{ field: 'email', rule: 'email' }]);

  if (!nextEmail && !hasLocalPassword_(row)) {
    throw ERR.conflict('EMAIL_REQUIRED_NO_PASSWORD');
  }

  if (nextEmail) {
    var conflictUser = Db.rows(SHEET.PENGGUNA).some(function (u) {
      return u.id_user !== row.id_user && normalizeEmail_(u.email) === nextEmail;
    });
    if (conflictUser) throw ERR.conflict('EMAIL_EXISTS');

    var conflictAnggota = Db.rows(SHEET.ANGGOTA).some(function (a) {
      return !a.is_deleted && a.id_anggota !== (row.id_anggota || '') && normalizeEmail_(a.email) === nextEmail;
    });
    if (conflictAnggota) throw ERR.conflict('EMAIL_EXISTS');
  }

  var prevUserEmail = normalizeEmail_(row.email || '') || '';
  var changed = false;
  if (prevUserEmail !== nextEmail) {
    Db.update(SHEET.PENGGUNA, row, { email: nextEmail });
    changed = true;
  }

  if (row.id_anggota) {
    var myAnggota = Db.findOne(SHEET.ANGGOTA, 'id_anggota', row.id_anggota);
    if (myAnggota && !myAnggota.is_deleted) {
      var prevAnggotaEmail = normalizeEmail_(myAnggota.email || '') || '';
      if (prevAnggotaEmail !== nextEmail) {
        Db.update(SHEET.ANGGOTA, myAnggota, { email: nextEmail, updated_at: nowIso_() });
        changed = true;
      }
    }
  }

  if (changed) {
    logActivity_(ctx, 'UPDATE', row.id_user, { entitas: 'pengguna', perubahan: ['email'] });
  }

  return { user: publicUser_(row), changed: changed };
}

function Auth_changePassword_(ctx, p) {
  var row = Db.findOne(SHEET.PENGGUNA, 'id_user', ctx.user.id_user);
  if (!row) throw ERR.unauthorized();
  if (hasLocalPassword_(row)) {
    var oldPw = typeof p.password_lama === 'string' ? p.password_lama : '';
    if (!verifyPassword_(oldPw, row.password_hash)) {
      throw new ApiError(400, 'INVALID_OLD_PASSWORD', 'Password lama tidak sesuai.');
    }
  }
  var newPw = typeof p.password_baru === 'string' ? p.password_baru : '';
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
