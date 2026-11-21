import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setTokenProvider, setUnauthorizedHandler } from '../lib/api.js';
import { clearLocalDatabase, db } from '../db/dexie.js';
import { syncFamilyData } from '../db/sync.js';
import { useI18n } from './I18nContext.jsx';
import { toastError } from '../lib/swal.js';

const SESSION_KEY = 'nasab_session_v1';

const AuthContext = createContext(null);

function readStoredSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || !parsed.user || !parsed.expires_at) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (Date.parse(parsed.expires_at) <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  if (typeof window === 'undefined') return;
  try {
    if (!session) window.localStorage.removeItem(SESSION_KEY);
    else window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Abaikan error storage
  }
}

export function AuthProvider({ children }) {
  const { t, translateError } = useI18n();
  const [session, setSession] = useState(readStoredSession);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const tokenRef = useRef(session?.token || '');
  const handling401Ref = useRef(false);

  useEffect(() => {
    tokenRef.current = session?.token || '';
  }, [session]);

  const clearSessionState = useCallback(async () => {
    tokenRef.current = '';
    setSession(null);
    setLastSyncAt('');
    writeStoredSession(null);
    await clearLocalDatabase().catch(() => {});
  }, []);

  useEffect(() => {
    setTokenProvider(() => tokenRef.current);
    setUnauthorizedHandler(async () => {
      if (handling401Ref.current) return;
      handling401Ref.current = true;
      await clearSessionState();
      toastError(t('errors.UNAUTHORIZED'));
      setTimeout(() => {
        handling401Ref.current = false;
      }, 1500);
    });
  }, [clearSessionState, t]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const triggerSync = useCallback(
    async ({ forceFull = false, silent = false, userId = '' } = {}) => {
      if (!tokenRef.current) return null;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

      setSyncing(true);
      try {
        const res = await syncFamilyData({
          forceFull,
          userId: userId || session?.user?.id_user || ''
        });
        if (res?.server_time) setLastSyncAt(res.server_time);
        return res;
      } catch (err) {
        if (!silent && err?.status !== 401) {
          toastError(translateError(err));
        }
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [session?.user?.id_user, translateError]
  );

  // Saat aplikasi dibuka dengan sesi valid: muat lastSyncAt dari Dexie,
  // lalu verifikasi auth.me + sinkronisasi delta di latar belakang jika online.
  useEffect(() => {
    let cancelled = false;
    if (!session?.token) return undefined;

    (async () => {
      const metaSync = await db.meta.get('last_sync_at').catch(() => null);
      if (!cancelled && metaSync?.value) setLastSyncAt(metaSync.value);

      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const meRes = await api.auth.me();
        if (cancelled) return;
        if (meRes?.user) {
          setSession((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              user: meRes.user,
              expires_at: meRes.expires_at || prev.expires_at
            };
            writeStoredSession(updated);
            return updated;
          });
        }
        await triggerSync({ silent: true, userId: meRes?.user?.id_user || session.user.id_user });
      } catch {
        // 401 sudah ditangani oleh onUnauthorizedHandler; error jaringan tetap izinkan akses offline
      }
    })();

    return () => {
      cancelled = true;
    };
    // Sengaja hanya dijalankan saat token berubah (login / startup)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const login = useCallback(
    async ({ username, password, remember = false }) => {
      const res = await api.auth.login({ username, password, remember });
      const nextSession = {
        token: res.token,
        expires_at: res.expires_at,
        user: res.user,
        remember: Boolean(remember)
      };
      tokenRef.current = nextSession.token;
      writeStoredSession(nextSession);
      setSession(nextSession);
      // Sinkronisasi awal segera di latar belakang
      syncFamilyData({ forceFull: false, userId: res.user.id_user })
        .then((syncRes) => {
          if (syncRes?.server_time) setLastSyncAt(syncRes.server_time);
        })
        .catch(() => {});
      return res;
    },
    []
  );

  const logout = useCallback(async () => {
    await clearSessionState();
  }, [clearSessionState]);

  const logoutAll = useCallback(async () => {
    try {
      await api.auth.logoutAll();
    } finally {
      await clearSessionState();
    }
  }, [clearSessionState]);

  const changePassword = useCallback(async ({ password_lama, password_baru }) => {
    const res = await api.auth.changePassword({ password_lama, password_baru });
    const nextSession = {
      token: res.token,
      expires_at: res.expires_at,
      user: res.user,
      remember: Boolean(session?.remember)
    };
    tokenRef.current = nextSession.token;
    writeStoredSession(nextSession);
    setSession(nextSession);
    return res;
  }, [session?.remember]);

  const user = session?.user || null;
  const value = useMemo(
    () => ({
      user,
      token: session?.token || '',
      expiresAt: session?.expires_at || '',
      isAuthenticated: Boolean(session?.token && user),
      isAdmin: Boolean(user && user.role === 'Admin'),
      booting: false,
      syncing,
      lastSyncAt,
      isOnline,
      login,
      logout,
      logoutAll,
      changePassword,
      triggerSync
    }),
    [
      user,
      session?.token,
      session?.expires_at,
      syncing,
      lastSyncAt,
      isOnline,
      login,
      logout,
      logoutAll,
      changePassword,
      triggerSync
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
