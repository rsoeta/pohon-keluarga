import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Download, Eye, EyeOff, Globe, Info, LogIn, Moon, Sun, TreePine } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { usePwaInstall } from '../hooks/usePwaInstall.js';
import { isApiConfigured } from '../lib/api.js';
import { alertError, toastSuccess } from '../lib/swal.js';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { lang, setLang, t, translateError } = useI18n();
  const { canInstall, promptInstall } = usePwaInstall();

  const navigate = useNavigate();
  const location = useLocation();
  const rawFrom = location.state?.from?.pathname;
  const redirectTo =
    typeof rawFrom === 'string' && /^\/(?!\/|\\)/.test(rawFrom) ? rawFrom : '/pohon';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || !password) {
      await alertError(t('common.requiredFields'));
      return;
    }

    setSubmitting(true);
    try {
      await login({ username: u, password, remember });
      toastSuccess(t('auth.loginSuccess'));
      navigate(redirectTo, { replace: true });
    } catch (err) {
      await alertError(t('auth.loginButton'), translateError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col justify-between px-4 py-4 sm:py-8 app-canvas text-ink">
      {/* Baris atas: Alih Bahasa ID/EN & Dark Mode */}
      <div className="w-full max-w-md mx-auto flex flex-wrap items-center justify-between gap-2">
        <SegmentedPillControl
          ariaLabel={t('settings.languageLabel')}
          value={lang}
          onChange={setLang}
          tone="brand"
          buttonClassName="px-3 uppercase"
          leading={
            <span className="pl-2.5 pr-1 text-muted" aria-hidden="true">
              <Globe className="w-4 h-4" />
            </span>
          }
          options={[
            { value: 'id', label: 'ID' },
            { value: 'en', label: 'EN' }
          ]}
        />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
          className="min-h-touch min-w-touch flex items-center justify-center rounded-full bg-surface border border-line text-ink shadow-card hover:bg-[var(--well)] transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* Kartu Login */}
      <main className="w-full max-w-md mx-auto my-6">
        <div className="bg-surface rounded-card shadow-float border border-line p-6 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-side text-[#c4ecd9] flex items-center justify-center shadow-sm border border-white/10 mb-3">
              <TreePine className="w-8 h-8" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">{t('app.name')}</h1>
            <p className="text-sm font-medium text-muted mt-1">{t('auth.loginTitle')}</p>
            <p className="text-xs text-faint mt-0.5">{t('auth.loginSubtitle')}</p>
          </div>

          {!isApiConfigured() && (
            <div className="mb-5 p-3.5 rounded-tile bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-900 dark:text-amber-200">
              {t('auth.apiNotConfigured')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-username" className="block text-sm font-bold text-ink mb-1.5">
                {t('auth.usernameLabel')}
              </label>
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                className="w-full min-h-touch px-4 py-2.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                required
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-bold text-ink mb-1.5">
                {t('auth.passwordLabel')}
              </label>
              <div className="relative flex items-center">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full min-h-touch pl-4 pr-14 py-2.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-0 min-h-touch min-w-touch flex items-center justify-center text-muted hover:text-ink rounded-tile"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <label
              htmlFor="login-remember"
              className="min-h-touch flex items-center gap-3 cursor-pointer select-none py-1"
            >
              <input
                id="login-remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-5 h-5 rounded border-[var(--line-2)] text-brand-700 focus:ring-brand-500"
              />
              <span className="text-sm font-semibold text-muted">{t('auth.rememberMe')}</span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-touch px-5 py-3 rounded-full bg-brand-700 hover:bg-brand-800 active:scale-[0.99] disabled:opacity-60 text-white font-bold text-base shadow-sm flex items-center justify-center gap-2 transition-all"
            >
              <LogIn className="w-5 h-5" aria-hidden="true" />
              <span>{submitting ? t('auth.loggingIn') : t('auth.loginButton')}</span>
            </button>
          </form>

          {canInstall && (
            <button
              type="button"
              onClick={promptInstall}
              className="mt-4 w-full min-h-touch px-4 py-2.5 rounded-full border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 text-brand-800 dark:text-brand-200 font-bold text-sm flex items-center justify-center gap-2 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('pwa.installBtn')}</span>
            </button>
          )}

          {/* Info Hubungi Admin */}
          <div className="mt-6 p-4 rounded-tile bg-surface-2 border border-line flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-700 dark:text-brand-300 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs leading-relaxed">
              <p className="font-bold text-ink">{t('auth.contactAdminTitle')}</p>
              <p className="text-muted mt-0.5">{t('auth.contactAdminBody')}</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs font-semibold text-faint">{t('app.domain')}</footer>
    </div>
  );
}
