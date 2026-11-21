import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cake, GitFork, Plus, Settings, Users } from 'lucide-react';
import { db } from '../../db/dexie.js';
import { countTodaysBirthdays } from '../../lib/birthday.js';
import { useI18n } from '../../contexts/I18nContext.jsx';

function resolveActiveTab(pathname) {
  if (pathname.startsWith('/pohon')) return '/pohon';
  if (pathname.startsWith('/daftar')) return '/daftar';
  if (pathname.startsWith('/tambah')) return '/tambah';
  if (pathname.startsWith('/ultah')) return '/ultah';
  if (pathname.startsWith('/setelan')) return '/setelan';
  return '';
}

export function BottomNav() {
  const { t } = useI18n();
  const location = useLocation();
  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const birthdayCount = countTodaysBirthdays(anggotaList);

  const activeTab = resolveActiveTab(location.pathname);

  const dockRef = useRef(null);
  const tabRefs = useRef(new Map());
  const hasMeasuredRef = useRef(false);

  const [indicator, setIndicator] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
    animate: false
  });

  const measure = useCallback(() => {
    const dock = dockRef.current;
    const activeEl = activeTab ? tabRefs.current.get(activeTab) : null;
    if (!dock || !activeEl) {
      setIndicator((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }

    const dRect = dock.getBoundingClientRect();
    const tRect = activeEl.getBoundingClientRect();
    const left = tRect.left - dRect.left - dock.clientLeft;
    const top = tRect.top - dRect.top - dock.clientTop;
    const width = tRect.width;
    const height = tRect.height;
    const shouldAnimate = hasMeasuredRef.current;

    setIndicator((prev) => {
      if (
        prev.left === left &&
        prev.top === top &&
        prev.width === width &&
        prev.height === height &&
        prev.ready &&
        prev.animate === shouldAnimate
      ) {
        return prev;
      }
      return { left, top, width, height, ready: true, animate: shouldAnimate };
    });

    if (!hasMeasuredRef.current) {
      window.requestAnimationFrame(() => {
        hasMeasuredRef.current = true;
        setIndicator((prev) => (prev.ready && !prev.animate ? { ...prev, animate: true } : prev));
      });
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    measure();
  }, [measure, t]);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return undefined;

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(dock);
    }

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [measure]);

  const setTabRef = (key) => (el) => {
    if (el) tabRefs.current.set(key, el);
    else tabRefs.current.delete(key);
  };

  const navItemClass = ({ isActive }) =>
    `relative z-10 flex-1 min-h-touch min-w-touch flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-2xl text-[0.7rem] font-bold transition-colors duration-200 ${
      isActive
        ? 'text-[var(--on-side-pill)]'
        : 'text-[var(--side-dim)] hover:text-[var(--on-side)] hover:bg-white/5'
    }`;

  return (
    <nav
      aria-label="Navigasi Utama"
      className="fixed bottom-3 inset-x-3 z-30 pointer-events-none pb-safe"
    >
      <div
        ref={dockRef}
        className="relative pointer-events-auto mx-auto w-full max-w-md sm:max-w-lg rounded-[26px] bg-side/95 backdrop-blur-md text-[var(--on-side)] shadow-float border border-white/10 px-2 py-1.5 flex items-center justify-between gap-1"
      >
        {/* Indikator Pill Mint Bergeser Halus */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 top-0 z-0 rounded-2xl bg-[var(--side-pill)] shadow-sm ${
            indicator.animate ? 'sliding-pill-indicator' : ''
          }`}
          style={{
            width: `${indicator.width}px`,
            height: `${indicator.height}px`,
            transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)`,
            opacity: indicator.ready ? 1 : 0
          }}
        />

        <NavLink ref={setTabRef('/pohon')} to="/pohon" className={navItemClass}>
          <GitFork className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full">{t('nav.tree')}</span>
        </NavLink>

        <NavLink ref={setTabRef('/daftar')} to="/daftar" className={navItemClass}>
          <Users className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full">{t('nav.list')}</span>
        </NavLink>

        <NavLink
          ref={setTabRef('/tambah')}
          to="/tambah"
          aria-label={t('nav.add')}
          title={t('nav.add')}
          className={({ isActive }) =>
            `relative z-10 shrink-0 min-h-touch min-w-[3.25rem] px-3 flex items-center justify-center rounded-2xl active:scale-95 transition-all duration-200 ${
              isActive
                ? 'text-[var(--on-side-pill)]'
                : 'bg-white/10 text-[#c4ecd9] border border-[#c4ecd9]/25 hover:bg-white/20'
            }`
          }
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} aria-hidden="true" />
        </NavLink>

        <NavLink ref={setTabRef('/ultah')} to="/ultah" className={navItemClass}>
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

        <NavLink ref={setTabRef('/setelan')} to="/setelan" className={navItemClass}>
          <Settings className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full">{t('nav.settings')}</span>
        </NavLink>
      </div>
    </nav>
  );
}
