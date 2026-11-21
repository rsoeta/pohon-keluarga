import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const QuickUiContext = createContext(null);

export function QuickUiProvider({ children }) {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [drawerHistory, setDrawerHistory] = useState([]);
  const [relationState, setRelationState] = useState({
    open: false,
    targetId: '',
    fromId: ''
  });

  const lastFocusRef = useRef(null);

  const captureFocus = useCallback(() => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      lastFocusRef.current = document.activeElement;
    }
  }, []);

  const restoreFocus = useCallback(() => {
    const el = lastFocusRef.current;
    lastFocusRef.current = null;
    if (el && el.isConnected && typeof el.focus === 'function') {
      window.requestAnimationFrame(() => {
        try {
          el.focus({ preventScroll: true });
        } catch {
          // Abaikan elemen yang tidak lagi bisa menerima fokus
        }
      });
    }
  }, []);

  const openCommandPalette = useCallback(() => {
    captureFocus();
    setDrawerHistory([]);
    setRelationState((prev) => (prev.open ? { ...prev, open: false } : prev));
    setCommandOpen(true);
  }, [captureFocus]);

  const closeCommandPalette = useCallback(
    ({ restore = true } = {}) => {
      setCommandOpen(false);
      if (restore) restoreFocus();
    },
    [restoreFocus]
  );

  const toggleCommandPalette = useCallback(() => {
    setCommandOpen((prev) => {
      if (!prev) {
        captureFocus();
        setDrawerHistory([]);
        return true;
      }
      restoreFocus();
      return false;
    });
  }, [captureFocus, restoreFocus]);

  const openMemberDrawer = useCallback(
    (memberId) => {
      if (!memberId) return;
      if (!drawerHistory.length && !commandOpen) captureFocus();
      setCommandOpen(false);
      setDrawerHistory([memberId]);
    },
    [captureFocus, drawerHistory.length, commandOpen]
  );

  const pushMemberDrawer = useCallback(
    (memberId) => {
      if (!memberId) return;
      setDrawerHistory((prev) => {
        if (!prev.length && !commandOpen) captureFocus();
        if (prev[prev.length - 1] === memberId) return prev;
        return [...prev, memberId];
      });
    },
    [captureFocus, commandOpen]
  );

  const popMemberDrawer = useCallback(() => {
    setDrawerHistory((prev) => {
      if (prev.length <= 1) {
        restoreFocus();
        return [];
      }
      return prev.slice(0, -1);
    });
  }, [restoreFocus]);

  const closeMemberDrawer = useCallback(
    ({ restore = true } = {}) => {
      setDrawerHistory([]);
      if (restore) restoreFocus();
    },
    [restoreFocus]
  );

  const openRelationModal = useCallback(
    (targetId = '', fromId = '') => {
      if (!commandOpen && !drawerHistory.length) captureFocus();
      setCommandOpen(false);
      setDrawerHistory([]);
      setRelationState({
        open: true,
        targetId: targetId || '',
        fromId: fromId || ''
      });
    },
    [captureFocus, commandOpen, drawerHistory.length]
  );

  const closeRelationModal = useCallback(() => {
    setRelationState({ open: false, targetId: '', fromId: '' });
    restoreFocus();
  }, [restoreFocus]);

  // Tutup overlay otomatis saat berpindah rute utama (mis. tombol Back browser)
  useEffect(() => {
    setCommandOpen(false);
    setDrawerHistory([]);
  }, [location.pathname]);

  // Pintasan keyboard global Cmd/Ctrl + K
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCommandPalette]);

  const drawerMemberId = drawerHistory[drawerHistory.length - 1] || '';

  const value = useMemo(
    () => ({
      commandOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      drawerHistory,
      drawerMemberId,
      openMemberDrawer,
      pushMemberDrawer,
      popMemberDrawer,
      closeMemberDrawer,
      relationState,
      openRelationModal,
      closeRelationModal
    }),
    [
      commandOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      drawerHistory,
      drawerMemberId,
      openMemberDrawer,
      pushMemberDrawer,
      popMemberDrawer,
      closeMemberDrawer,
      relationState,
      openRelationModal,
      closeRelationModal
    ]
  );

  return <QuickUiContext.Provider value={value}>{children}</QuickUiContext.Provider>;
}

export function useQuickUi() {
  const ctx = useContext(QuickUiContext);
  if (!ctx) throw new Error('useQuickUi must be used inside QuickUiProvider');
  return ctx;
}
