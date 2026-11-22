/**
 * Code.gs — Titik masuk Web App (doGet / doPost), router aksi, dan pembungkus
 * LockService untuk seluruh operasi tulis.
 *
 * KONTRAK API (JSON):
 *   POST <WEB_APP_URL>
 *   Content-Type: text/plain;charset=utf-8   (menghindari CORS preflight; GAS tidak mendukung OPTIONS)
 *   Body: { "action": "anggota.update", "token": "<sesi>", "payload": { ... } }
 *
 *   Respons sukses : { "ok": true,  "data": ... }
 *   Respons gagal  : { "ok": false, "error": { "status": 403, "code": "FORBIDDEN", "message": "Forbidden" } }
 *
 * GAS selalu membalas HTTP 200; status semantik (400/401/403/404/409/429/500/503)
 * dibawa di `error.status`. Token dikirim di body (GAS tidak bisa membaca header
 * request dan token di URL berisiko tercatat di log).
 */

/** Health check publik — tidak membuka data apa pun. */
function doGet() {
  return jsonOut_({ ok: true, data: { app: APP.NAME, version: APP.VERSION, status: 'online' } });
}

function doPost(e) {
  var action = '';
  var started = Date.now();
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') throw ERR.badRequest();
    var raw = e.postData.contents;
    if (raw.length > APP.MAX_BODY_CHARS) throw ERR.tooLarge();

    var req;
    try { req = JSON.parse(raw); } catch (parseErr) { throw ERR.badRequest(); }
    if (!req || typeof req !== 'object' || Array.isArray(req)) throw ERR.badRequest();

    action = typeof req.action === 'string' ? req.action : '';
    var routes = getRoutes_();
    if (!action || !hasOwn_(routes, action)) throw ERR.badRequest('UNKNOWN_ACTION');
    var route = routes[action];

    var payload = (req.payload && typeof req.payload === 'object' && !Array.isArray(req.payload)) ? req.payload : {};
    var token = typeof req.token === 'string' ? req.token : '';

    var result = route.write
      ? withScriptLock_(function () { return execute_(route, token, payload); })
      : execute_(route, token, payload);

    if (isDebug_()) console.log(JSON.stringify({ action: action, ms: Date.now() - started, ok: true }));
    return jsonOut_({ ok: true, data: result === undefined ? null : result });
  } catch (err) {
    return jsonOut_(errorEnvelope_(err, action));
  }
}

/** Autentikasi + otorisasi level-rute, lalu jalankan handler. */
function execute_(route, token, payload) {
  var ctx = null;
  if (route.auth !== 'public') {
    ctx = authenticate_(token);
    if (route.auth === 'admin') rbacRequireAdmin_(ctx);
  }
  return route.handler(ctx, payload);
}

/**
 * Semua operasi tulis dibungkus Script Lock untuk mencegah race condition.
 * Cache dibersihkan setelah lock didapat agar validasi/RBAC memakai data terbaru
 * (mencegah TOCTOU).
 */
function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(APP.LOCK_TIMEOUT_MS)) throw ERR.busy();
  try {
    Db.clearCache();
    var out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

/** Mengubah error menjadi amplop respons GENERIK (tanpa stack trace / detail internal). */
function errorEnvelope_(err, action) {
  if (err instanceof ApiError) {
    var e = { status: err.status, code: err.code, message: err.message };
    if (err.fields) e.fields = err.fields;
    if (isDebug_()) console.warn(JSON.stringify({ action: action, status: err.status, code: err.code }));
    return { ok: false, error: e };
  }
  console.error(JSON.stringify({
    action: action,
    error: String(err && err.message ? err.message : err),
    stack: err && err.stack ? String(err.stack) : ''
  }));
  return { ok: false, error: { status: 500, code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server.' } };
}

/**
 * Tabel rute. auth: 'public' | 'user' | 'admin'. write: true → dibungkus LockService.
 * Didefinisikan di dalam fungsi agar tidak bergantung urutan pemuatan file .gs.
 */
function getRoutes_() {
  return {
    // --- Autentikasi
    'auth.config':           { auth: 'public', write: false, handler: Auth_config_ },
    'auth.login':            { auth: 'public', write: false, handler: Auth_login_ },
    'auth.googleLogin':      { auth: 'public', write: true,  handler: Auth_googleLogin_ },
    'auth.me':               { auth: 'user',   write: false, handler: Auth_me_ },
    'auth.changePassword':   { auth: 'user',   write: true,  handler: Auth_changePassword_ },
    'auth.logoutAll':        { auth: 'user',   write: true,  handler: Auth_logoutAll_ },

    // --- Data & sinkronisasi (Dexie.js)
    'data.sync':             { auth: 'user',   write: false, handler: Data_sync_ },
    'settings.public':       { auth: 'user',   write: false, handler: Settings_public_ },

    // --- Anggota
    'anggota.get':           { auth: 'user',   write: false, handler: Anggota_get_ },
    'anggota.create':        { auth: 'user',   write: true,  handler: Anggota_create_ },
    'anggota.update':        { auth: 'user',   write: true,  handler: Anggota_update_ },
    'anggota.delete':        { auth: 'admin',  write: true,  handler: Anggota_softDelete_ },
    'anggota.restore':       { auth: 'admin',  write: true,  handler: Anggota_restore_ },
    'anggota.listDeleted':   { auth: 'admin',  write: false, handler: Anggota_listDeleted_ },

    // --- Pernikahan
    'pernikahan.create':     { auth: 'user',   write: true,  handler: Pernikahan_create_ },
    'pernikahan.update':     { auth: 'user',   write: true,  handler: Pernikahan_update_ },
    'pernikahan.delete':     { auth: 'admin',  write: true,  handler: Pernikahan_softDelete_ },
    'pernikahan.restore':    { auth: 'admin',  write: true,  handler: Pernikahan_restore_ },

    // --- Foto (Google Drive, privat)
    'foto.upload':           { auth: 'user',   write: true,  handler: Foto_upload_ },
    'foto.remove':           { auth: 'user',   write: true,  handler: Foto_remove_ },
    'foto.get':              { auth: 'user',   write: false, handler: Foto_get_ },
    'foto.getBatch':         { auth: 'user',   write: false, handler: Foto_getBatch_ },

    // --- Kalkulator Nasab
    'nasab.hubungan':        { auth: 'user',   write: false, handler: Nasab_hubungan_ },

    // --- GEDCOM (Admin)
    'gedcom.preview':        { auth: 'admin',  write: false, handler: Gedcom_preview_ },
    'gedcom.import':         { auth: 'admin',  write: true,  handler: Gedcom_import_ },

    // --- Panel Administrator
    'admin.users.list':          { auth: 'admin', write: false, handler: Admin_listUsers_ },
    'admin.users.create':        { auth: 'admin', write: true,  handler: Admin_createUser_ },
    'admin.users.update':        { auth: 'admin', write: true,  handler: Admin_updateUser_ },
    'admin.users.resetPassword': { auth: 'admin', write: true,  handler: Admin_resetPassword_ },
    'admin.users.revokeSessions':{ auth: 'admin', write: true,  handler: Admin_revokeSessions_ },
    'admin.settings.get':        { auth: 'admin', write: false, handler: Admin_getSettings_ },
    'admin.settings.update':     { auth: 'admin', write: true,  handler: Admin_updateSettings_ },
    'admin.wa.setToken':         { auth: 'admin', write: true,  handler: Admin_setWaToken_ },
    'admin.wa.test':             { auth: 'admin', write: false, handler: Admin_waTest_ },
    'admin.stats':               { auth: 'admin', write: false, handler: Admin_stats_ },
    'admin.auth.getConfig':      { auth: 'admin', write: false, handler: Admin_getAuthConfig_ },
    'admin.auth.setConfig':      { auth: 'admin', write: true,  handler: Admin_setAuthConfig_ }
  };
}
