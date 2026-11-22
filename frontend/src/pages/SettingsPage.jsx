import { useEffect, useState } from 'react';
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
  Mail,
  Moon,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  Type,
  UserCheck
} from 'lucide-react';
import { db } from '../db/dexie.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { useFont } from '../contexts/FontContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { usePwaInstall } from '../hooks/usePwaInstall.js';
import { alertError, alertSuccess, confirmAction, toastSuccess } from '../lib/swal.js';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';
import { SYSTEM_FONT_VALUE } from '../lib/fonts.js';

export function SettingsPage() {
  const {
    user,
    isAdmin,
    syncing,
    lastSyncAt,
    isOnline,
    logout,
    logoutAll,
    updateEmail,
    changePassword,
    triggerSync
  } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { fontFamily } = useFont();
  const { lang, setLang, t, translateError } = useI18n();
  const { canInstall, isStandalone, promptInstall } = usePwaInstall();

  const anggotaCount = useLiveQuery(() => db.anggota.count(), [], 0);
  const pernikahanCount = useLiveQuery(() => db.pernikahan.count(), [], 0);
  const linkedAnggota = useLiveQuery(
    () => (user?.id_anggota ? db.anggota.get(user.id_anggota) : undefined),
    [user?.id_anggota]
  );

  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [savingEmail, setSavingEmail] = useState(false);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    setEmailInput(user?.email || '');
  }, [user?.email]);

  const handleSync = async (forceFull) => {
    const res = await triggerSync({ forceFull, silent: false });
    if (res) toastSuccess(t('sync.syncSuccess'));
  };

  const hasLocalPassword = user?.has_password !== false;

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (cleanEmail && !/^[^\s@<>'"]+@[^\s@<>'"]+\.[^\s@<>'"]+$/.test(cleanEmail)) {
      await alertError(t('settings.googleEmailTitle'), t('form.invalidEmail'));
      return;
    }
    if (!cleanEmail && !hasLocalPassword) {
      await alertError(t('settings.googleEmailTitle'), t('errors.EMAIL_REQUIRED_NO_PASSWORD'));
      return;
    }
    if (!cleanEmail && !user?.email) {
      await alertError(t('common.requiredFields'));
      return;
    }
    if (!cleanEmail && user?.email) {
      const ok = await confirmAction({
        title: t('settings.googleEmailTitle'),
        text: t('settings.emailRemoveConfirm'),
        confirmText: t('common.confirm'),
        cancelText: t('common.cancel'),
        danger: true
      });
      if (!ok) return;
    }

    setSavingEmail(true);
    try {
      await updateEmail(cleanEmail);
      if (user?.id_anggota) {
        await triggerSync({ forceFull: false, silent: true });
      }
      toastSuccess(cleanEmail ? t('settings.emailSaved') : t('settings.emailRemoved'));
    } catch (err) {
      await alertError(t('settings.googleEmailTitle'), translateError(err));
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if ((hasLocalPassword && !oldPw) || !newPw || !confirmPw) {
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
      await changePassword({
        password_lama: hasLocalPassword ? oldPw : '',
        password_baru: newPw
      });
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
    <div className="flex-1 flex flex-col gap-3.5">
      {/* Bar Atas Kompak: Judul + Identitas Akun + Status PWA */}
      <section className="bg-surface rounded-card border border-line px-4 py-3 sm:px-5 shadow-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 flex items-center justify-center">
            <UserCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-ink leading-tight truncate">
              {t('settings.title')}
            </h1>
            <p className="text-xs font-semibold text-muted truncate">
              @{user?.username}
              {user?.email ? ` · ${user.email}` : ''} · {t('settings.linkedProfile')}:{' '}
              <span className="text-ink">
                {linkedAnggota?.nama_lengkap || t('settings.noLinkedProfile')}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canInstall ? (
            <button
              type="button"
              onClick={promptInstall}
              className="min-h-ctl px-3 rounded-full bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 text-brand-800 dark:text-brand-200 font-bold text-xs inline-flex items-center gap-1.5 hover:bg-brand-100/70 transition-colors"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>{t('pwa.installBtn')}</span>
            </button>
          ) : isStandalone ? (
            <span
              title={t('pwa.installedHint')}
              className="min-h-ctl px-2.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t('pwa.installedHint')}</span>
            </span>
          ) : null}

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

      {/* Split-View Grid Desktop (2 Kolom Seimbang, Bebas Vertical Scroll) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-stretch">
        {/* Kolom Kiri: Preferensi Tampilan + Sinkronisasi & Cache Lokal */}
        <div className="flex flex-col gap-3.5 min-w-0">
          <section className="bg-surface rounded-card border border-line p-4 shadow-card space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
              {t('settings.preferencesTitle')}
            </h2>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0" />
                <span className="text-sm font-bold text-ink">{t('settings.languageLabel')}</span>
              </div>
              <SegmentedPillControl
                ariaLabel={t('settings.languageLabel')}
                value={lang}
                onChange={setLang}
                tone="brand"
                className="bg-surface-2"
                buttonClassName="px-4 uppercase"
                options={[
                  { value: 'id', label: 'ID' },
                  { value: 'en', label: 'EN' }
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-line">
              <div className="flex items-center gap-2.5">
                {isDark ? (
                  <Moon className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span className="text-sm font-bold text-ink">{t('settings.themeLabel')}</span>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="min-h-ctl px-3.5 rounded-full border border-line bg-surface-2 text-xs sm:text-sm font-bold text-ink flex items-center gap-2 hover:bg-[var(--well)] transition-colors"
              >
                {isDark ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span>{isDark ? t('theme.dark') : t('theme.light')}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-line">
              <div className="flex items-center gap-2.5 min-w-0">
                <Type className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{t('settings.fontLabel')}</p>
                  {!isAdmin && (
                    <p className="text-[0.6875rem] font-medium text-muted">{t('settings.fontManagedByAdmin')}</p>
                  )}
                </div>
              </div>

              {isAdmin ? (
                <Link
                  to="/admin?tab=settings"
                  className="min-h-ctl px-3.5 rounded-full border border-line bg-surface-2 text-xs sm:text-sm font-bold text-ink inline-flex items-center gap-1.5 hover:bg-[var(--well)] transition-colors max-w-full"
                >
                  <span className="truncate max-w-[10rem]">
                    {fontFamily === SYSTEM_FONT_VALUE ? t('admin.fontSystemName') : fontFamily}
                  </span>
                  <span className="text-brand-700 dark:text-brand-300">· {t('settings.manageFontBtn')}</span>
                  <ChevronRight className="w-4 h-4 text-faint shrink-0" />
                </Link>
              ) : (
                <span
                  title={t('settings.fontManagedByAdmin')}
                  className="min-h-ctl px-3.5 rounded-full border border-line bg-surface-2 text-xs sm:text-sm font-bold text-muted inline-flex items-center max-w-full truncate"
                >
                  {fontFamily === SYSTEM_FONT_VALUE ? t('admin.fontSystemName') : fontFamily}
                </span>
              )}
            </div>
          </section>

          <section className="bg-surface rounded-card border border-line p-4 shadow-card flex-1 flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-brand-700 dark:text-brand-300" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
                  {t('settings.dataTitle')}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-tile bg-surface-2 border border-line">
                  <p className="text-xs font-semibold text-muted">{t('sync.cachedMembers')}</p>
                  <p className="text-lg font-bold text-ink">{anggotaCount}</p>
                </div>
                <div className="p-2.5 rounded-tile bg-surface-2 border border-line">
                  <p className="text-xs font-semibold text-muted">{t('sync.cachedMarriages')}</p>
                  <p className="text-lg font-bold text-ink">{pernikahanCount}</p>
                </div>
              </div>

              <p className="text-xs font-semibold text-muted">
                {t('sync.lastSync')}: <span className="text-ink">{formattedSync}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={syncing || !isOnline}
                onClick={() => handleSync(false)}
                className="min-h-ctl px-3 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
                <span className="truncate">{syncing ? t('sync.syncing') : t('sync.syncNow')}</span>
              </button>

              <button
                type="button"
                disabled={syncing || !isOnline}
                onClick={() => handleSync(true)}
                className="min-h-ctl px-3 rounded-full border border-line bg-surface-2 text-ink hover:bg-[var(--well)] disabled:opacity-50 font-bold text-xs sm:text-sm truncate transition-colors"
              >
                {t('sync.fullReload')}
              </button>
            </div>
          </section>
        </div>

        {/* Kolom Kanan: Pintasan Administrator (jika Admin) + Keamanan Akun */}
        <div className="flex flex-col gap-3.5 min-w-0">
          {isAdmin && (
            <section className="bg-surface rounded-card border border-heritage-200 dark:border-heritage-900/60 p-4 shadow-card space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-heritage-700 dark:text-heritage-400">
                {t('settings.adminSectionTitle')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Link
                  to="/admin"
                  className="min-h-touch flex items-center justify-between gap-2.5 p-3 rounded-tile bg-heritage-50/70 dark:bg-heritage-950/30 hover:bg-heritage-100/70 dark:hover:bg-heritage-900/30 border border-heritage-200/60 dark:border-heritage-900/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldCheck className="w-5 h-5 text-heritage-700 dark:text-heritage-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{t('settings.adminPanelBtn')}</p>
                      <p className="text-[0.6875rem] text-muted line-clamp-2">{t('settings.adminPanelDesc')}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-faint shrink-0" />
                </Link>

                <Link
                  to="/admin/gedcom"
                  className="min-h-touch flex items-center justify-between gap-2.5 p-3 rounded-tile bg-surface-2 hover:bg-[var(--well)] border border-line transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileUp className="w-5 h-5 text-brand-700 dark:text-brand-300 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{t('settings.gedcomImportBtn')}</p>
                      <p className="text-[0.6875rem] text-muted line-clamp-2">{t('settings.gedcomImportDesc')}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-faint shrink-0" />
                </Link>
              </div>
            </section>
          )}

          <section className="bg-surface rounded-card border border-line p-4 shadow-card flex-1 flex flex-col justify-between gap-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-brand-700 dark:text-brand-300" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
                  {t('settings.securityTitle')}
                </h2>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-1.5 pb-3 border-b border-line" noValidate>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="settings-email" className="text-sm font-bold text-ink inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-brand-700 dark:text-brand-300 shrink-0" aria-hidden="true" />
                    <span>{t('settings.googleEmailTitle')}</span>
                  </label>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[0.6875rem] font-bold ${
                      user?.email
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-surface-2 border border-line text-muted'
                    }`}
                  >
                    {user?.email ? t('settings.googleEmailLinked') : t('settings.googleEmailUnlinked')}
                  </span>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    id="settings-email"
                    type="email"
                    maxLength={160}
                    autoComplete="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={t('settings.googleEmailPlaceholder')}
                    className="flex-1 min-w-0 min-h-ctl px-3.5 py-1.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="submit"
                    disabled={savingEmail || !isOnline}
                    className="w-full sm:w-auto min-h-ctl px-4 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-colors shadow-sm shrink-0"
                  >
                    {savingEmail ? t('common.saving') : t('settings.saveEmailBtn')}
                  </button>
                </div>

                <p className="text-[0.6875rem] text-muted">{t('settings.googleEmailHint')}</p>
              </form>

              <form onSubmit={handlePasswordSubmit} className="space-y-2.5" noValidate>
                <p className="text-sm font-bold text-ink">{t('auth.changePasswordTitle')}</p>

                {hasLocalPassword && (
                  <div className="relative flex items-center">
                    <input
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={oldPw}
                      onChange={(e) => setOldPw(e.target.value)}
                      placeholder={t('auth.oldPassword')}
                      className="w-full min-h-touch pl-3.5 pr-12 py-2 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? t('auth.hidePassword') : t('auth.showPassword')}
                      className="absolute right-0 min-h-touch min-w-touch flex items-center justify-center text-muted hover:text-ink"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="relative flex items-center">
                    <input
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder={t('auth.newPassword')}
                      className={`w-full min-h-touch ${
                        !hasLocalPassword ? 'pl-3.5 pr-12' : 'px-3.5'
                      } py-2 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500`}
                    />
                    {!hasLocalPassword && (
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? t('auth.hidePassword') : t('auth.showPassword')}
                        className="absolute right-0 min-h-touch min-w-touch flex items-center justify-center text-muted hover:text-ink"
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder={t('auth.confirmPassword')}
                    className="w-full min-h-touch px-3.5 py-2 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <p className="text-xs font-medium text-muted flex-1 min-w-[12rem]">
                    {t('auth.passwordPolicyHint')}
                  </p>

                  <button
                    type="submit"
                    disabled={savingPw || !isOnline}
                    className="w-full sm:w-auto min-h-ctl px-4 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-colors shadow-sm"
                  >
                    {savingPw ? t('common.loading') : t('settings.savePasswordBtn')}
                  </button>
                </div>
              </form>
            </div>

            <div className="pt-3 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleLogoutAll}
                disabled={!isOnline}
                className="min-h-ctl px-3.5 rounded-full border border-rose-300/80 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 font-bold text-xs sm:text-sm transition-colors"
              >
                {t('settings.logoutAllBtn')}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="min-h-ctl px-3.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('settings.logoutBtn')}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
