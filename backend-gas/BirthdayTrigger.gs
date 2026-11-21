/**
 * BirthdayTrigger.gs — Penghitungan ulang tahun (mengabaikan tanggal parsial
 * dan anggota wafat, serta penyesuaian 29 Februari -> 28 Februari di tahun
 * non-kabisat) dan pengiriman pengingat harian ke WhatsApp API Gateway.
 *
 * Token WA Gateway HANYA dibaca dari PropertiesService (PROP.WA_TOKEN).
 */

/**
 * Mengembalikan bulan/hari perayaan ulang tahun pada tahun `year`, atau null bila
 * tanggal lahir kosong/parsial (mis. 'YYYY').
 */
function birthdayEffectiveMonthDay_(tglLahir, year) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tglLahir || '').trim());
  if (!m) return null;
  var birthYear = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  if (month === 2 && day === 29 && !isLeapYear_(year)) {
    return { month: 2, day: 28, birthYear: birthYear, isLeapAdjusted: true };
  }
  return { month: month, day: day, birthYear: birthYear, isLeapAdjusted: false };
}

/** Mengembalikan daftar anggota hidup yang berulang tahun pada refDateStr ('YYYY-MM-DD'). */
function getTodaysBirthdays_(anggotaRows, refDateStr) {
  var ref = refDateStr || todayString_();
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ref);
  if (!m) return [];
  var refYear = Number(m[1]);
  var refMonth = Number(m[2]);
  var refDay = Number(m[3]);

  var list = [];
  (anggotaRows || []).forEach(function (a) {
    if (!a || a.is_deleted || a.status_hidup !== true) return;
    var eff = birthdayEffectiveMonthDay_(a.tgl_lahir, refYear);
    if (!eff || eff.month !== refMonth || eff.day !== refDay) return;
    list.push({
      id_anggota: a.id_anggota,
      nama_lengkap: a.nama_lengkap,
      domisili: a.domisili || '',
      no_wa: a.no_wa || '',
      tgl_lahir: a.tgl_lahir,
      usia: refYear - eff.birthYear,
      is_leap_adjusted: eff.isLeapAdjusted
    });
  });

  list.sort(function (x, y) {
    return String(x.nama_lengkap || '').localeCompare(String(y.nama_lengkap || ''));
  });
  return list;
}

function formatBirthdayMessage_(settings, list, refDateStr) {
  var lines = list.map(function (item, idx) {
    var line = (idx + 1) + '. *' + item.nama_lengkap + '*';
    if (item.usia > 0) line += ' (' + item.usia + ' thn)';
    if (item.is_leap_adjusted) line += ' [29 Feb]';
    if (item.domisili) line += ' — ' + item.domisili;
    return line;
  });
  var tpl = (settings && settings.wa_template) ? settings.wa_template : DEFAULT_SETTINGS.wa_template;
  return tpl
    .replace(/\{nama_keluarga\}/g, (settings && settings.nama_keluarga) || DEFAULT_SETTINGS.nama_keluarga)
    .replace(/\{tanggal\}/g, refDateStr)
    .replace(/\{daftar\}/g, lines.join('\n'));
}

function sendWhatsAppMessage_(target, message, settings) {
  var token = PropertiesService.getScriptProperties().getProperty(PROP.WA_TOKEN);
  if (!token) throw ERR.unavailable('WA_TOKEN_NOT_SET');

  var url = String((settings && settings.wa_gateway_url) || '').trim();
  if (!isSafeHttpsUrl_(url)) {
    throw ERR.validation([{ field: 'wa_gateway_url', rule: 'https' }]);
  }

  var provider = (settings && settings.wa_provider) || 'fonnte';
  var options = { method: 'post', muteHttpExceptions: true };

  if (provider === 'fonnte') {
    options.headers = { Authorization: token };
    options.payload = { target: target, message: message };
  } else if (provider === 'wablas') {
    options.headers = { Authorization: token };
    options.contentType = 'application/json';
    options.payload = JSON.stringify({ phone: target, message: message, isGroup: 'true' });
  } else {
    options.headers = { Authorization: 'Bearer ' + token };
    options.contentType = 'application/json';
    options.payload = JSON.stringify({ target: target, message: message });
  }

  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error(JSON.stringify({ event: 'WA_GATEWAY_ERROR', provider: provider, http_status: code }));
    throw ERR.unavailable('WA_GATEWAY_ERROR');
  }
  return { http_status: code };
}

/** Mengelola Time-driven Trigger harian untuk `runDailyBirthdayJob`. */
function syncBirthdayTrigger_(hour, active) {
  var h = Number(hour);
  if (!isFinite(h) || h < 0 || h > 23) h = 6;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDailyBirthdayJob') ScriptApp.deleteTrigger(t);
  });
  if (!active) return false;

  ScriptApp.newTrigger('runDailyBirthdayJob')
    .timeBased()
    .everyDays(1)
    .atHour(Math.trunc(h))
    .inTimezone(APP.TIMEZONE)
    .create();
  return true;
}

/**
 * Titik masuk Time-driven Trigger harian. Idempoten per tanggal di Asia/Jakarta
 * dan dilindungi Script Lock.
 */
function runDailyBirthdayJob() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(APP.LOCK_TIMEOUT_MS)) return { skipped: 'lock_busy' };
  try {
    Db.clearCache();
    var today = todayString_();
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty(PROP.LAST_BIRTHDAY_RUN) === today) {
      return { skipped: 'already_ran', date: today };
    }

    var settings = getAllSettings_();
    var token = props.getProperty(PROP.WA_TOKEN);
    if (settings.wa_aktif !== 'true' || !settings.wa_group_id || !token) {
      return { skipped: 'not_configured' };
    }

    var list = getTodaysBirthdays_(Db.rows(SHEET.ANGGOTA), today);
    if (!list.length) return { skipped: 'no_birthdays', date: today };

    var msg = formatBirthdayMessage_(settings, list, today);
    sendWhatsAppMessage_(settings.wa_group_id, msg, settings);

    props.setProperty(PROP.LAST_BIRTHDAY_RUN, today);
    logActivity_(null, 'NOTIFIKASI_WA', today, { jumlah: list.length });
    SpreadsheetApp.flush();
    return { sent: true, count: list.length, date: today };
  } finally {
    lock.releaseLock();
  }
}

/** Handler `admin.wa.test` (Admin): uji kirim pesan ke grup/nomor target. */
function Admin_waTest_(ctx, p) {
  var settings = getAllSettings_();
  var target = sanitizeText_(p.target || settings.wa_group_id, 100);
  if (!target) throw ERR.validation([{ field: 'wa_group_id', rule: 'required' }]);

  var defaultMsg = 'Tes notifikasi WhatsApp ' + settings.nama_keluarga + ' (' + todayString_() + ') berhasil!';
  var msg = sanitizeText_(p.message || defaultMsg, 500, true);
  var res = sendWhatsAppMessage_(target, msg, settings);
  return { sent: true, http_status: res.http_status };
}
