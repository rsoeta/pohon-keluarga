import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Moon, RefreshCw, Sun, TreePine } from 'lucide-react';
import { db } from '../../db/dexie.js';
import { getCachedPhoto } from '../../db/sync.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
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
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
      <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/pohon"
          className="min-h-touch flex items-center gap-2.5 pr-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 min-w-0"
        >
          <span className="w-10 h-10 shrink-0 rounded-xl bg-brand-700 text-white flex items-center justify-center shadow-sm">
            <TreePine className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[11rem] sm:max-w-xs">
              {familyName}
            </p>
            <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-slate-500 dark:text-slate-400">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{isOnline ? t('sync.online') : t('sync.offline')}</span>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !isOnline}
            aria-label={t('sync.syncNow')}
            title={t('sync.syncNow')}
            className="min-h-touch min-w-touch flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin text-brand-600 dark:text-brand-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
            title={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
            className="min-h-touch min-w-touch flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          <Link
            to="/setelan"
            aria-label={t('nav.settings')}
            title={displayName}
            className="min-h-touch min-w-touch flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-brand-500/40"
              />
            ) : (
              <span className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-800 dark:text-brand-200 text-xs font-bold flex items-center justify-center ring-2 ring-brand-500/30">
                {getInitials(displayName)}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
