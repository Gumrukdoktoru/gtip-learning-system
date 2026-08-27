import type { UserRole } from '@gtip/shared';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../stores/auth-store';

export interface ProtectedRouteProps {
  roles: UserRole[];
}

/**
 * Client side gate for admin screens.
 *
 * This only hides the UI: every protected action is authorised again on the
 * server, so a forged local session buys nothing.
 */
export function ProtectedRoute({ roles }: ProtectedRouteProps): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/giris" replace state={{ from: location.pathname }} />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
