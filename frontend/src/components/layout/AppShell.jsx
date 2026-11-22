import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { QuickUiProvider, useQuickUi } from '../../contexts/QuickUiContext.jsx';
import { TopHeader } from './TopHeader.jsx';
import { BottomNav } from './BottomNav.jsx';
import { CommandPalette } from '../common/CommandPalette.jsx';
import { MemberQuickDrawer } from '../common/MemberQuickDrawer.jsx';
import { RelationshipModal } from '../nasab/RelationshipModal.jsx';

function AppShellInner() {
  const { isOnline } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const { relationState, closeRelationModal } = useQuickUi();

  useEffect(() => {
    if (typeof window === 'undefined' || window.scrollY <= 0) return;
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh flex flex-col app-canvas text-ink">
      <a href="#main-content" className="skip-link">
        {t('common.skipToContent')}
      </a>

      <TopHeader />

      {!isOnline && (
        <div
          role="status"
          className="w-full bg-amber-100/90 dark:bg-amber-950/80 border-b border-amber-300/60 dark:border-amber-800/80 text-amber-950 dark:text-amber-200"
        >
          <div className="w-full px-3 sm:px-4 lg:px-6 py-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold">
            <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('sync.offlineBanner')}</span>
          </div>
        </div>
      )}

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 flex flex-col w-full px-3 sm:px-4 lg:px-6 pt-3 pb-24 focus:outline-none"
      >
        <div key={location.pathname} className="page-enter flex-1 flex flex-col">
          <Outlet />
        </div>
      </main>

      <BottomNav />
      <CommandPalette />
      <MemberQuickDrawer />
      <RelationshipModal
        isOpen={relationState.open}
        targetId={relationState.targetId}
        initialFromId={relationState.fromId}
        onClose={closeRelationModal}
      />
    </div>
  );
}

export function AppShell() {
  return (
    <QuickUiProvider>
      <AppShellInner />
    </QuickUiProvider>
  );
}
