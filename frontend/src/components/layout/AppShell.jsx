import { Outlet } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { TopHeader } from './TopHeader.jsx';
import { BottomNav } from './BottomNav.jsx';

export function AppShell() {
  const { isOnline } = useAuth();
  const { t } = useI18n();

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopHeader />

      {!isOnline && (
        <div
          role="status"
          className="w-full bg-amber-100 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200"
        >
          <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold">
            <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('sync.offlineBanner')}</span>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 pt-4 pb-24">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
