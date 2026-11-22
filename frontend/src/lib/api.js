const API_URL = (import.meta.env?.VITE_API_URL || '').trim();
const DEFAULT_TIMEOUT_MS = 35000;

export class ApiClientError extends Error {
  constructor(status, code, message, fields = null) {
    super(message || code || 'Error');
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code || 'INTERNAL_ERROR';
    this.fields = fields;
  }
}

export function isApiConfigured() {
  const isProd = Boolean(import.meta.env?.PROD);
  const schemeRe = isProd ? /^https:\/\//i : /^https?:\/\//i;
  return Boolean(
    API_URL &&
      schemeRe.test(API_URL) &&
      !API_URL.includes('REPLACE_WITH_DEPLOYMENT_ID')
  );
}

let getTokenFn = () => '';
let onUnauthorizedFn = null;

export function setTokenProvider(fn) {
  getTokenFn = typeof fn === 'function' ? fn : () => '';
}

export function setUnauthorizedHandler(fn) {
  onUnauthorizedFn = typeof fn === 'function' ? fn : null;
}

/**
 * Memanggil Web App Google Apps Script via POST.
 * Menggunakan text/plain agar bebas CORS preflight (GAS tidak mendukung OPTIONS).
 */
export async function apiPost(action, payload = {}, opts = {}) {
  if (!isApiConfigured()) {
    throw new ApiClientError(503, 'API_NOT_CONFIGURED', 'API endpoint is not configured');
  }

  const token = opts.token !== undefined ? opts.token : getTokenFn() || '';
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action, token, payload }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new ApiClientError(504, 'REQUEST_TIMEOUT', 'Request timed out');
    }
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Network error');
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new ApiClientError(502, 'INVALID_RESPONSE', 'Invalid JSON response');
  }

  if (!json || json.ok !== true) {
    const err = (json && json.error) || {};
    const status = Number(err.status || 500);
    const code = err.code || 'INTERNAL_ERROR';
    if (
      status === 401 &&
      action !== 'auth.login' &&
      action !== 'auth.googleLogin' &&
      action !== 'auth.config' &&
      onUnauthorizedFn
    ) {
      onUnauthorizedFn();
    }
    throw new ApiClientError(status, code, err.message || code, err.fields || null);
  }

  return json.data;
}

export const api = {
  auth: {
    config: () => apiPost('auth.config', {}, { token: '' }),
    login: (payload) => apiPost('auth.login', payload, { token: '' }),
    googleLogin: (payload) => apiPost('auth.googleLogin', payload, { token: '' }),
    me: () => apiPost('auth.me', {}),
    updateEmail: (email) => apiPost('auth.updateEmail', { email }),
    changePassword: (payload) => apiPost('auth.changePassword', payload),
    logoutAll: () => apiPost('auth.logoutAll', {})
  },
  data: {
    sync: (since) => apiPost('data.sync', since ? { since } : {})
  },
  settings: {
    public: () => apiPost('settings.public', {})
  },
  anggota: {
    get: (id_anggota) => apiPost('anggota.get', { id_anggota }),
    create: (payload) => apiPost('anggota.create', payload),
    update: (id_anggota, data) => apiPost('anggota.update', { id_anggota, data }),
    delete: (id_anggota) => apiPost('anggota.delete', { id_anggota }),
    restore: (id_anggota) => apiPost('anggota.restore', { id_anggota }),
    listDeleted: () => apiPost('anggota.listDeleted', {})
  },
  pernikahan: {
    create: (data) => apiPost('pernikahan.create', { data }),
    update: (id_pernikahan, data) => apiPost('pernikahan.update', { id_pernikahan, data }),
    delete: (id_pernikahan) => apiPost('pernikahan.delete', { id_pernikahan }),
    restore: (id_pernikahan) => apiPost('pernikahan.restore', { id_pernikahan })
  },
  foto: {
    upload: (payload) => apiPost('foto.upload', payload, { timeoutMs: 60000 }),
    remove: (id_anggota) => apiPost('foto.remove', { id_anggota }),
    get: (payload) => apiPost('foto.get', payload),
    getBatch: (file_ids) => apiPost('foto.getBatch', { file_ids })
  },
  nasab: {
    hubungan: (from_id, to_id) => apiPost('nasab.hubungan', { from_id, to_id })
  },
  gedcom: {
    preview: (content) => apiPost('gedcom.preview', { content }, { timeoutMs: 60000 }),
    import: (content, mode = 'merge') => apiPost('gedcom.import', { content, mode }, { timeoutMs: 90000 })
  },
  admin: {
    usersList: () => apiPost('admin.users.list', {}),
    usersCreate: (payload) => apiPost('admin.users.create', payload),
    usersUpdate: (payload) => apiPost('admin.users.update', payload),
    usersResetPassword: (payload) => apiPost('admin.users.resetPassword', payload),
    usersRevokeSessions: (id_user) => apiPost('admin.users.revokeSessions', { id_user }),
    settingsGet: () => apiPost('admin.settings.get', {}),
    settingsUpdate: (payload) => apiPost('admin.settings.update', payload),
    setWaToken: (token) => apiPost('admin.wa.setToken', { token }),
    waTest: (payload = {}) => apiPost('admin.wa.test', payload),
    stats: () => apiPost('admin.stats', {}),
    authGetConfig: () => apiPost('admin.auth.getConfig', {}),
    authSetConfig: (payload) => apiPost('admin.auth.setConfig', payload)
  }
};
