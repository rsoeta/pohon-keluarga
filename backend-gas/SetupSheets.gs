/**
 * SetupSheets.gs — Inisialisasi otomatis 5 sheet Google Spreadsheets,
 * rahasia Script Properties, folder Drive foto profil, dan akun Admin awal.
 *
 * Aman dijalankan berulang kali (idempoten).
 * Jalankan fungsi `setupSheets()` satu kali dari editor Google Apps Script.
 */

function generateRandomPassword_(length) {
  var len = length || 16;
  var upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var lower = 'abcdefghjkmnpqrstuvwxyz';
  var digits = '23456789';
  var all = upper + lower + digits;
  var bytes = randomBytes_(len + 4);
  var chars = [
    upper.charAt((bytes[0] & 0xff) % upper.length),
    lower.charAt((bytes[1] & 0xff) % lower.length),
    digits.charAt((bytes[2] & 0xff) % digits.length)
  ];
  for (var i = 3; i < len; i++) {
    chars.push(all.charAt((bytes[i] & 0xff) % all.length));
  }
  // Fisher-Yates shuffle
  for (var j = chars.length - 1; j > 0; j--) {
    var k = (bytes[(j + 3) % bytes.length] & 0xff) % (j + 1);
    var tmp = chars[j];
    chars[j] = chars[k];
    chars[k] = tmp;
  }
  return chars.join('');
}

function ensureSheetSchema_(ss, sheetName, cols) {
  var sh = ss.getSheetByName(sheetName);
  var headers = cols.map(function (c) { return c[0]; });
  var formats = cols.map(function (c) { return (c[1] === 'bool' || c[1] === 'int') ? '0' : '@'; });
  var created = false;

  if (!sh) {
    sh = ss.insertSheet(sheetName);
    created = true;
  }

  var lastCol = sh.getLastColumn();
  if (sh.getLastRow() === 0 || lastCol === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    headers.forEach(function (h) {
      if (existing.indexOf(h) === -1) {
        existing.push(h);
        sh.getRange(1, existing.length).setValue(h);
      }
    });
  }

  var finalCols = Math.max(sh.getLastColumn(), headers.length);
  var headerRange = sh.getRange(1, 1, 1, finalCols);
  headerRange.setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  if (sh.getMaxRows() >= 2) {
    var actualHeaders = sh.getRange(1, 1, 1, finalCols).getValues()[0].map(function (h) { return String(h).trim(); });
    var colMap = {};
    cols.forEach(function (c) { colMap[c[0]] = (c[1] === 'bool' || c[1] === 'int') ? '0' : '@'; });
    var rowFmt = actualHeaders.map(function (h) { return colMap[h] || '@'; });
    var fmtRows = Math.min(sh.getLastRow() > 1 ? sh.getLastRow() - 1 : 1, sh.getMaxRows() - 1);
    sh.getRange(2, 1, fmtRows, finalCols).setNumberFormats(
      Array.apply(null, Array(fmtRows)).map(function () { return rowFmt; })
    );
  }

  return { name: sheetName, created: created };
}

function ensureFotoFolder_(props) {
  var existingId = props.getProperty(PROP.FOTO_FOLDER_ID);
  if (existingId) {
    try {
      var existing = DriveApp.getFolderById(existingId);
      if (existing && (!existing.isTrashed || !existing.isTrashed())) return existingId;
    } catch (ignore) {}
  }
  var folder = DriveApp.createFolder('Pohon Keluarga - Foto Profil');
  var newId = folder.getId();
  props.setProperty(PROP.FOTO_FOLDER_ID, newId);
  return newId;
}

/**
 * Menginisialisasi seluruh struktur spreadsheet, secret, folder foto,
 * pengaturan default, dan akun Admin pertama.
 */
function setupSheets() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty(PROP.SPREADSHEET_ID);
  var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Tidak ada Spreadsheet aktif. Set Script Property SPREADSHEET_ID atau buka dari bound sheet.');
  if (!ssId) props.setProperty(PROP.SPREADSHEET_ID, ss.getId());

  // 1. Rahasia server & mode debug produksi OFF
  ensureSecret_(PROP.SESSION_SECRET);
  ensureSecret_(PROP.PASSWORD_PEPPER);
  if (props.getProperty(PROP.DEBUG_MODE) === null) {
    props.setProperty(PROP.DEBUG_MODE, 'false');
  }

  // 2. Pastikan ke-5 sheet sesuai PRD ada dan memiliki header lengkap
  var sheetNames = Object.keys(SCHEMA);
  var sheetResults = sheetNames.map(function (name) {
    return ensureSheetSchema_(ss, name, SCHEMA[name]);
  });

  // Hapus Sheet1 bawaan bila masih kosong dan 5 sheet sudah ada
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > sheetNames.length &&
      defaultSheet.getLastRow() === 0 && defaultSheet.getLastColumn() === 0) {
    ss.deleteSheet(defaultSheet);
  }

  Db.clearCache();

  // 3. Isi Pengaturan_Sistem default (hanya kunci yang belum ada)
  var existingSettings = Db.indexBy(SHEET.PENGATURAN, 'kunci');
  var newSettings = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (!existingSettings[k]) newSettings.push({ kunci: k, nilai: DEFAULT_SETTINGS[k] });
  });
  if (newSettings.length) Db.insertMany(SHEET.PENGATURAN, newSettings);

  // 4. Folder Google Drive privat untuk foto profil
  var folderId = ensureFotoFolder_(props);

  // 5. Bootstrap akun Admin pertama bila Data_Pengguna kosong
  var adminBootstrapped = false;
  if (Db.rows(SHEET.PENGGUNA).length === 0) {
    var username = normalizeUsername_(props.getProperty(PROP.BOOTSTRAP_ADMIN_USERNAME) || 'admin') || 'admin';
    var customPw = props.getProperty(PROP.BOOTSTRAP_ADMIN_PASSWORD);
    var pw = customPw || generateRandomPassword_(16);

    Db.insert(SHEET.PENGGUNA, {
      id_user: Utilities.getUuid(),
      username: username,
      password_hash: hashPassword_(pw),
      id_anggota: '',
      role: 'Admin',
      status_aktif: true,
      token_version: 1,
      email: ''
    });

    if (customPw) {
      props.deleteProperty(PROP.BOOTSTRAP_ADMIN_PASSWORD);
      Logger.log('Akun Admin awal dibuat untuk username: ' + username + ' (menggunakan password dari Script Property, property telah dihapus).');
    } else {
      Logger.log('=== AKUN ADMIN AWAL (TAMPIL SEKALI — SEGERA GANTI PASSWORD) ===');
      Logger.log('Username : ' + username);
      Logger.log('Password : ' + pw);
    }
    adminBootstrapped = true;
  }

  SpreadsheetApp.flush();

  return {
    spreadsheet_id: ss.getId(),
    sheets: sheetResults,
    foto_folder_id: folderId,
    admin_bootstrapped: adminBootstrapped,
    wa_token_configured: !!props.getProperty(PROP.WA_TOKEN),
    turnstile_configured: !!(props.getProperty(PROP.TURNSTILE_SITE_KEY) && props.getProperty(PROP.TURNSTILE_SECRET_KEY)),
    google_oauth_configured: !!props.getProperty(PROP.GOOGLE_CLIENT_ID)
  };
}

/** Helper opsional untuk menyetel Cloudflare Turnstile dari editor GAS. */
function setTurnstileKeys(siteKey, secretKey, allowedHostnames) {
  var props = PropertiesService.getScriptProperties();
  var sk = typeof siteKey === 'string' ? siteKey.trim() : '';
  var sec = typeof secretKey === 'string' ? secretKey.trim() : '';
  if (!sk || !sec) {
    props.deleteProperty(PROP.TURNSTILE_SITE_KEY);
    props.deleteProperty(PROP.TURNSTILE_SECRET_KEY);
  } else {
    props.setProperty(PROP.TURNSTILE_SITE_KEY, sk);
    props.setProperty(PROP.TURNSTILE_SECRET_KEY, sec);
  }
  if (typeof allowedHostnames === 'string') {
    var hosts = normalizeHostnameList_(allowedHostnames);
    if (hosts === null) throw new Error('Format allowedHostnames tidak valid.');
    if (hosts) props.setProperty(PROP.TURNSTILE_ALLOWED_HOSTNAMES, hosts);
    else props.deleteProperty(PROP.TURNSTILE_ALLOWED_HOSTNAMES);
  }
  return { turnstile_enabled: !!(sk && sec) };
}

/** Helper opsional untuk menyetel Google OAuth Client ID dari editor GAS. */
function setGoogleOAuthClientId(clientId) {
  var props = PropertiesService.getScriptProperties();
  var cid = typeof clientId === 'string' ? clientId.trim() : '';
  if (!cid) props.deleteProperty(PROP.GOOGLE_CLIENT_ID);
  else props.setProperty(PROP.GOOGLE_CLIENT_ID, cid);
  return { google_oauth_enabled: !!cid };
}

/** Helper opsional untuk memasang trigger ulang tahun harian dari editor GAS. */
function installDailyBirthdayTrigger() {
  var settings = getAllSettings_();
  var hour = Number(settings.wa_jam_trigger || 6);
  syncBirthdayTrigger_(hour, true);
  return { installed: true, hour: hour, timezone: APP.TIMEZONE };
}

/** Helper opsional untuk menyetel token WA Gateway dari editor GAS. */
function setWaGatewayToken(token) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Token WA Gateway tidak boleh kosong.');
  PropertiesService.getScriptProperties().setProperty(PROP.WA_TOKEN, token.trim());
  return { wa_token_configured: true };
}
