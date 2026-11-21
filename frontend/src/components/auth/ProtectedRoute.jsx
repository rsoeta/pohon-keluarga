import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { toastError } from '../../lib/swal.js';

export function ProtectedRoute({ children }) {
  const { isAuthenticated, booting } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (booting) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-4 app-canvas">
        <div className="w-10 h-10 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
        <p className="text-sm font-semibold text-muted">
          {t('auth.sessionRestoring')}
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children || <Outlet />;
}

export function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    if (isAuthenticated && !isAdmin) {
      toastError(t('errors.FORBIDDEN'));
    }
  }, [isAuthenticated, isAdmin, t]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/pohon" replace />;
  }

  return children || <Outlet />;
}
