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
    `flex-1 min-h-touch min-w-touch flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-2xl text-[0.7rem] font-bold transition-colors ${
      isActive
        ? 'bg-[var(--side-pill)] text-[var(--on-side-pill)] shadow-sm'
        : 'text-[var(--side-dim)] hover:text-[var(--on-side)] hover:bg-white/5'
    }`;

  return (
    <nav
      aria-label="Navigasi Utama"
      className="fixed bottom-3 inset-x-3 z-30 pointer-events-none pb-safe"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-md sm:max-w-lg rounded-[26px] bg-side/95 backdrop-blur-md text-[var(--on-side)] shadow-float border border-white/10 px-2 py-1.5 flex items-center justify-between gap-1">
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
          title={t('nav.add')}
          className={({ isActive }) =>
            `shrink-0 min-h-touch min-w-[3.25rem] px-3 flex items-center justify-center rounded-2xl bg-[var(--side-pill)] text-[var(--on-side-pill)] hover:opacity-95 active:scale-95 shadow-sm transition-all ${
              isActive ? 'ring-2 ring-white/50' : ''
            }`
          }
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
        </NavLink>

        <NavLink to="/ultah" className={navItemClass}>
          <span className="relative inline-flex">
            <Cake className="w-5 h-5 shrink-0" aria-hidden="true" />
            {birthdayCount > 0 && (
              <span
                aria-label={`${birthdayCount}`}
                className="absolute -top-1.5 -right-2.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-rose-600 text-white text-[0.65rem] font-bold flex items-center justify-center leading-none shadow-sm ring-2 ring-side"
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
