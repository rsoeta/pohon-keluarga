import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Globe,
  KeyRound,
  LogOut,
  Moon,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  UserCheck
} from 'lucide-react';
import { db } from '../db/dexie.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { usePwaInstall } from '../hooks/usePwaInstall.js';
import { alertError, alertSuccess, confirmAction, toastSuccess } from '../lib/swal.js';

export function SettingsPage() {
  const {
    user,
    isAdmin,
    syncing,
    lastSyncAt,
    isOnline,
    logout,
    logoutAll,
    changePassword,
    triggerSync
  } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { lang, setLang, t, translateError } = useI18n();
  const { canInstall, isStandalone, promptInstall } = usePwaInstall();

  const anggotaCount = useLiveQuery(() => db.anggota.count(), [], 0);
  const pernikahanCount = useLiveQuery(() => db.pernikahan.count(), [], 0);
  const linkedAnggota = useLiveQuery(
    () => (user?.id_anggota ? db.anggota.get(user.id_anggota) : undefined),
    [user?.id_anggota]
  );

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const handleSync = async (forceFull) => {
    const res = await triggerSync({ forceFull, silent: false });
    if (res) toastSuccess(t('sync.syncSuccess'));
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!oldPw || !newPw || !confirmPw) {
      await alertError(t('common.requiredFields'));
      return;
    }
    if (newPw !== confirmPw) {
      await alertError(t('auth.changePasswordTitle'), t('auth.passwordMismatch'));
      return;
    }
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      await alertError(t('auth.changePasswordTitle'), t('auth.passwordPolicyHint'));
      return;
    }

    setSavingPw(true);
    try {
      await changePassword({ password_lama: oldPw, password_baru: newPw });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      await alertSuccess(t('auth.changePasswordSuccess'));
    } catch (err) {
      await alertError(t('auth.changePasswordTitle'), translateError(err));
    } finally {
      setSavingPw(false);
    }
  };

  const handleLogout = async () => {
    const ok = await confirmAction({
      title: t('auth.logoutConfirmTitle'),
      text: t('auth.logoutConfirmBody'),
      confirmText: t('settings.logoutBtn'),
      cancelText: t('common.cancel'),
      danger: true
    });
    if (!ok) return;
    await logout();
    toastSuccess(t('auth.logoutSuccess'));
  };

  const handleLogoutAll = async () => {
    const ok = await confirmAction({
      title: t('auth.logoutAllConfirmTitle'),
      text: t('auth.logoutAllConfirmBody'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      danger: true
    });
    if (!ok) return;
    try {
      await logoutAll();
      toastSuccess(t('auth.logoutAllSuccess'));
    } catch (err) {
      await alertError(t('settings.logoutAllBtn'), translateError(err));
    }
  };

  const formattedSync = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID')
    : t('sync.neverSynced');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('settings.title')}</h1>

      {/* Kartu Akun */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-2xl bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 flex items-center justify-center">
              <UserCheck className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-white truncate">
                @{user?.username}
              </p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                {t('settings.linkedProfile')}:{' '}
                <span className="text-slate-700 dark:text-slate-200">
                  {linkedAnggota?.nama_lengkap || t('settings.noLinkedProfile')}
                </span>
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isAdmin
                ? 'bg-heritage-100 text-heritage-800 dark:bg-heritage-900/40 dark:text-heritage-300'
                : 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300'
            }`}
          >
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            {isAdmin ? t('settings.roleAdmin') : t('settings.roleUser')}
          </span>
        </div>
      </section>

      {/* Preferensi Bahasa, Tema & PWA */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t('settings.preferencesTitle')}
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t('settings.languageLabel')}
            </span>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {['id', 'en'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`min-h-touch min-w-touch px-4 rounded-lg text-xs font-bold uppercase transition-colors ${
                  lang === code
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            {isDark ? (
              <Moon className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <Sun className="w-5 h-5 text-amber-500 shrink-0" />
            )}
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t('settings.themeLabel')}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-touch px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {isDark ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <span>{isDark ? t('theme.dark') : t('theme.light')}</span>
          </button>
        </div>

        {(canInstall || isStandalone) && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            {canInstall ? (
              <button
                type="button"
                onClick={promptInstall}
                className="w-full min-h-touch px-4 py-2.5 rounded-xl bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 text-brand-800 dark:text-brand-200 font-bold text-sm flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>{t('pwa.installBtn')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>{t('pwa.installedHint')}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Sinkronisasi & Cache Lokal (Dexie.js) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('settings.dataTitle')}
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[8rem] p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t('sync.cachedMembers')}
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{anggotaCount}</p>
          </div>
          <div className="flex-1 min-w-[8rem] p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t('sync.cachedMarriages')}
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{pernikahanCount}</p>
          </div>
        </div>

        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {t('sync.lastSync')}: <span className="text-slate-700 dark:text-slate-200">{formattedSync}</span>
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={syncing || !isOnline}
            onClick={() => handleSync(false)}
            className="flex-1 min-w-[9rem] min-h-touch px-4 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? t('sync.syncing') : t('sync.syncNow')}</span>
          </button>

          <button
            type="button"
            disabled={syncing || !isOnline}
            onClick={() => handleSync(true)}
            className="flex-1 min-w-[9rem] min-h-touch px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 font-bold text-sm transition-colors"
          >
            {t('sync.fullReload')}
          </button>
        </div>
      </section>

      {/* Khusus Admin: Panel Administrator & Impor GEDCOM */}
      {isAdmin && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-heritage-200 dark:border-heritage-900/60 p-4 sm:p-5 shadow-sm space-y-2.5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-heritage-700 dark:text-heritage-400">
            {t('settings.adminSectionTitle')}
          </h2>

          <Link
            to="/admin"
            className="min-h-touch flex items-center justify-between gap-3 p-3.5 rounded-xl bg-heritage-50/70 dark:bg-heritage-950/30 hover:bg-heritage-100/70 dark:hover:bg-heritage-900/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="w-5 h-5 text-heritage-700 dark:text-heritage-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('settings.adminPanelBtn')}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t('settings.adminPanelDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </Link>

          <Link
            to="/admin/gedcom"
            className="min-h-touch flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileUp className="w-5 h-5 text-brand-700 dark:text-brand-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('settings.gedcomImportBtn')}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t('settings.gedcomImportDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </Link>
        </section>
      )}

      {/* Keamanan Akun: Ubah Password & Logout */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('settings.securityTitle')}
          </h2>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-3" noValidate>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('auth.changePasswordTitle')}
          </p>

          <div className="relative flex items-center">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              placeholder={t('auth.oldPassword')}
              className="w-full min-h-touch pl-4 pr-14 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute right-0 min-h-touch min-w-touch flex items-center justify-center text-slate-500"
            >
              {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <input
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder={t('auth.newPassword')}
            className="w-full min-h-touch px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          <input
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder={t('auth.confirmPassword')}
            className="w-full min-h-touch px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('auth.passwordPolicyHint')}
          </p>

          <button
            type="submit"
            disabled={savingPw || !isOnline}
            className="w-full sm:w-auto min-h-touch px-5 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-sm transition-colors"
          >
            {savingPw ? t('common.loading') : t('settings.savePasswordBtn')}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleLogoutAll}
            disabled={!isOnline}
            className="flex-1 min-w-[11rem] min-h-touch px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 font-bold text-sm transition-colors"
          >
            {t('settings.logoutAllBtn')}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex-1 min-w-[9rem] min-h-touch px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('settings.logoutBtn')}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
