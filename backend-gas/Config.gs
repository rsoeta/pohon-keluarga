/**
 * Config.gs — Konfigurasi global, skema sheet, enum, dan kunci PropertiesService.
 * Pohon Keluarga · Backend Google Apps Script (V8 runtime)
 *
 * CATATAN KEAMANAN:
 *  - Jangan pernah menaruh token / API key / password di file ini.
 *    Semua rahasia disimpan di Script Properties (PropertiesService).
 *  - APP.DEBUG hanya menambah log di sisi server (Stackdriver/Executions),
 *    TIDAK PERNAH mengirim detail error ke klien.
 */

var APP = Object.freeze({
  NAME: 'Pohon Keluarga',
  VERSION: '1.0.0',
  TIMEZONE: 'Asia/Jakarta',

  // Sesi
  TOKEN_PREFIX: 'v1',
  SESSION_TTL_MS: 24 * 60 * 60 * 1000,               // 24 jam (standar)
  SESSION_TTL_REMEMBER_MS: 30 * 24 * 60 * 60 * 1000, // 30 hari (Ingat Saya)

  // Password (PBKDF2-HMAC-SHA256 + pepper di PropertiesService)
  PBKDF2_ITERATIONS: 4096,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,

  // Anti brute-force login
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCK_SECONDS: 15 * 60,

  // Konkurensi & batas ukuran
  LOCK_TIMEOUT_MS: 20000,
  MAX_BODY_CHARS: 8 * 1024 * 1024,
  MAX_PHOTO_BYTES: 2 * 1024 * 1024,
  ALLOWED_PHOTO_MIME: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  PHOTO_BATCH_MAX: 20,
  MAX_GEDCOM_CHARS: 5 * 1024 * 1024,
  MAX_GEDCOM_INDIVIDUALS: 5000,
  LOG_DETAIL_MAX_CHARS: 40000,

  // Sinkronisasi delta (jendela tumpang-tindih untuk mencegah data terlewat)
  SYNC_OVERLAP_MS: 2 * 60 * 1000
});

/** Kunci Script Properties. Nilai rahasia TIDAK pernah dikirim ke klien. */
var PROP = Object.freeze({
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  FOTO_FOLDER_ID: 'FOTO_FOLDER_ID',
  SESSION_SECRET: 'SESSION_SECRET',
  PASSWORD_PEPPER: 'PASSWORD_PEPPER',
  WA_TOKEN: 'WA_GATEWAY_TOKEN',
  LAST_BIRTHDAY_RUN: 'LAST_BIRTHDAY_RUN',
  DEBUG_MODE: 'DEBUG_MODE',
  BOOTSTRAP_ADMIN_USERNAME: 'BOOTSTRAP_ADMIN_USERNAME',
  BOOTSTRAP_ADMIN_PASSWORD: 'BOOTSTRAP_ADMIN_PASSWORD'
});

var SHEET = Object.freeze({
  ANGGOTA: 'Data_Anggota',
  PERNIKAHAN: 'Data_Pernikahan',
  PENGGUNA: 'Data_Pengguna',
  LOG: 'Log_Aktivitas',
  PENGATURAN: 'Pengaturan_Sistem'
});

var ENUM = Object.freeze({
  ROLE: Object.freeze(['Admin', 'User']),
  JENIS_KELAMIN: Object.freeze(['L', 'P']),
  STATUS_ANAK: Object.freeze(['Kandung', 'Angkat']),
  STATUS_PERNIKAHAN: Object.freeze(['Aktif', 'Cerai', 'Wafat']),
  AKSI_LOG: Object.freeze(['CREATE', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'IMPORT_GEDCOM', 'NOTIFIKASI_WA']),
  WA_PROVIDER: Object.freeze(['fonnte', 'wablas', 'generic'])
});

/**
 * Skema 5 sheet. Format: [nama_kolom, tipe]
 * Tipe: 'string' (teks, dilindungi anti-formula), 'date' (teks tanggal parsial),
 *       'bool', 'int'.
 * Kolom `updated_at` ditambahkan pada Data_Anggota & Data_Pernikahan untuk
 * sinkronisasi delta Dexie.js (tidak mengubah semantik PRD).
 */
var SCHEMA = {
  Data_Anggota: [
    ['id_anggota', 'string'],
    ['kode_unik', 'string'],
    ['gedcom_xref_id', 'string'],
    ['nama_lengkap', 'string'],
    ['jenis_kelamin', 'string'],
    ['tgl_lahir', 'date'],
    ['status_hidup', 'bool'],
    ['urutan_anak', 'int'],
    ['status_anak', 'string'],
    ['domisili', 'string'],
    ['no_wa', 'string'],
    ['foto_file_id', 'string'],
    ['id_ayah', 'string'],
    ['id_ibu', 'string'],
    ['id_pernikahan_ortu', 'string'],
    ['is_deleted', 'bool'],
    ['updated_at', 'string']
  ],
  Data_Pernikahan: [
    ['id_pernikahan', 'string'],
    ['id_suami', 'string'],
    ['id_istri', 'string'],
    ['status_pernikahan', 'string'],
    ['urutan_pasangan', 'int'],
    ['is_deleted', 'bool'],
    ['updated_at', 'string']
  ],
  Data_Pengguna: [
    ['id_user', 'string'],
    ['username', 'string'],
    ['password_hash', 'string'],
    ['id_anggota', 'string'],
    ['role', 'string'],
    ['status_aktif', 'bool'],
    ['token_version', 'int']
  ],
  Log_Aktivitas: [
    ['id_log', 'string'],
    ['timestamp', 'string'],
    ['id_user', 'string'],
    ['aksi', 'string'],
    ['target_id', 'string'],
    ['detail', 'string']
  ],
  Pengaturan_Sistem: [
    ['kunci', 'string'],
    ['nilai', 'string']
  ]
};

/** Nilai awal Pengaturan_Sistem (tanpa rahasia apa pun). */
var DEFAULT_SETTINGS = Object.freeze({
  nama_keluarga: 'Keluarga Besar',
  id_leluhur_utama: '',
  wa_aktif: 'false',
  wa_provider: 'fonnte',
  wa_gateway_url: 'https://api.fonnte.com/send',
  wa_group_id: '',
  wa_jam_trigger: '6',
  wa_template: '🎉 *Ulang Tahun Hari Ini* — {nama_keluarga}\n📅 {tanggal}\n\n{daftar}\n\nMari kirimkan doa & ucapan terbaik! 🤲'
});

/** Pengaturan yang boleh dibaca semua pengguna login. */
var PUBLIC_SETTING_KEYS = Object.freeze(['nama_keluarga', 'id_leluhur_utama']);

/** Kolom Data_Anggota yang boleh diisi klien (whitelist anti mass-assignment). */
var ANGGOTA_INPUT_FIELDS = Object.freeze([
  'nama_lengkap', 'jenis_kelamin', 'tgl_lahir', 'status_hidup', 'urutan_anak',
  'status_anak', 'domisili', 'no_wa', 'id_ayah', 'id_ibu', 'id_pernikahan_ortu'
]);
var LINEAGE_FIELDS = Object.freeze(['id_ayah', 'id_ibu', 'id_pernikahan_ortu']);

/** Mode debug: default OFF. Hanya menambah log server, tidak pernah ke klien. */
function isDebug_() {
  try {
    return PropertiesService.getScriptProperties().getProperty(PROP.DEBUG_MODE) === 'true';
  } catch (e) {
    return false;
  }
}
