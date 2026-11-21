import { NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cake, GitFork, Plus, Settings, Users } from 'lucide-react';
import { db } from '../../db/dexie.js';
import { countTodaysBirthdays } from '../../lib/birthday.js';
import { useI18n } from '../../contexts/I18nContext.jsx';

export function BottomNav() {
  const { t } = useI18n();
  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const birthdayCount = countTodaysBirthdays(anggotaList);

  const navItemClass = ({ isActive }) =>
    `flex-1 min-h-touch min-w-touch flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[0.7rem] font-bold transition-colors ${
      isActive
        ? 'text-brand-700 dark:text-brand-300'
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
    }`;

  return (
    <nav
      aria-label="Navigasi Utama"
      className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-safe"
    >
      <div className="w-full max-w-5xl mx-auto px-2 py-1 flex items-center justify-around gap-1">
        <NavLink to="/pohon" className={navItemClass}>
          <GitFork className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full">{t('nav.tree')}</span>
        </NavLink>

        <NavLink to="/daftar" className={navItemClass}>
          <Users className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full">{t('nav.list')}</span>
        </NavLink>

        <NavLink
          to="/tambah"
          aria-label={t('nav.add')}
          className="shrink-0 min-h-[3.25rem] min-w-[3.25rem] -mt-4 flex items-center justify-center rounded-2xl bg-brand-700 hover:bg-brand-800 active:scale-95 text-white shadow-lg shadow-brand-700/30 ring-4 ring-white dark:ring-slate-900 transition-all"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
        </NavLink>

        <NavLink to="/ultah" className={navItemClass}>
          <span className="relative inline-flex">
            <Cake className="w-5 h-5 shrink-0" aria-hidden="true" />
            {birthdayCount > 0 && (
              <span
                aria-label={`${birthdayCount}`}
                className="absolute -top-1.5 -right-2.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-rose-600 text-white text-[0.65rem] font-bold flex items-center justify-center leading-none shadow-sm"
              >
                {birthdayCount > 99 ? '99+' : birthdayCount}
              </span>
            )}
          </span>
          <span className="truncate max-w-full">{t('nav.birthday')}</span>
        </NavLink>

        <NavLink to="/setelan" className={navItemClass}>
          <Settings className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full">{t('nav.settings')}</span>
        </NavLink>
      </div>
    </nav>
  );
}
