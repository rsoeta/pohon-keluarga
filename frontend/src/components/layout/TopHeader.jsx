import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Moon, RefreshCw, Search, Sun, TreePine } from 'lucide-react';
import { db } from '../../db/dexie.js';
import { getCachedPhoto } from '../../db/sync.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useQuickUi } from '../../contexts/QuickUiContext.jsx';
import { toastSuccess } from '../../lib/swal.js';

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopHeader() {
  const { user, syncing, isOnline, triggerSync } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useI18n();
  const { openCommandPalette } = useQuickUi();

  const metaPengaturan = useLiveQuery(() => db.meta.get('pengaturan'), []);
  const myAnggota = useLiveQuery(
    () => (user?.id_anggota ? db.anggota.get(user.id_anggota) : undefined),
    [user?.id_anggota]
  );

  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    let active = true;
    const fileId = myAnggota?.foto_file_id;
    if (!fileId) {
      setAvatarUrl('');
      return undefined;
    }
    getCachedPhoto(fileId)
      .then((url) => {
        if (active && url) setAvatarUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [myAnggota?.foto_file_id]);

  const familyName = metaPengaturan?.value?.nama_keluarga || t('app.name');
  const displayName = myAnggota?.nama_lengkap || user?.username || '';

  const handleSync = async () => {
    const res = await triggerSync({ forceFull: false, silent: false });
    if (res) toastSuccess(t('sync.syncSuccess'));
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-1.5 flex items-center justify-between gap-2 sm:gap-3">
        {/* Kiri: Brand Organic Pine */}
        <Link
          to="/pohon"
          className="h-9 flex items-center gap-2 pr-1 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 min-w-0 shrink-0"
        >
          <span className="w-9 h-9 shrink-0 rounded-xl bg-side text-[#c4ecd9] flex items-center justify-center shadow-sm border border-white/10">
            <TreePine className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm sm:text-[0.95rem] font-bold text-ink leading-tight truncate max-w-[9.5rem] sm:max-w-[13rem]">
              {familyName}
            </p>
            <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-muted">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{isOnline ? t('sync.online') : t('sync.offline')}</span>
            </div>
          </div>
        </Link>

        {/* Tengah (Desktop): Pill Command Palette ⌘K ala Tend */}
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label={t('command.dialogLabel')}
          className="hidden md:flex flex-1 max-w-md h-9 items-center justify-between gap-2 px-3.5 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Search className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold truncate">{t('command.triggerPlaceholder')}</span>
          </span>
          <kbd className="px-2 py-0.5 rounded-full bg-surface border border-line text-[0.65rem] font-mono font-bold text-faint shrink-0">
            ⌘K
          </kbd>
        </button>

        {/* Kanan: Kontrol Cepat */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label={t('command.triggerShort')}
            title={`${t('command.triggerShort')} (⌘K)`}
            className="md:hidden h-9 w-9 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !isOnline}
            aria-label={t('sync.syncNow')}
            title={t('sync.syncNow')}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink disabled:opacity-50 transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 ${syncing ? 'animate-spin text-brand-700 dark:text-brand-300' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
            title={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <Link
            to="/setelan"
            aria-label={t('nav.settings')}
            title={displayName}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-[var(--well)] transition-colors"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-500/40"
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-800 dark:text-brand-200 text-[0.7rem] font-bold flex items-center justify-center ring-2 ring-brand-500/30">
                {getInitials(displayName)}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
