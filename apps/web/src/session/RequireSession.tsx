import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from './SessionProvider.js';

// Guards every page but sign-in. A signed-out visitor goes to /login, and the page they asked for is
// carried in router state, never in the query string, so there is no open-redirect surface. After an
// explicit logout nothing is carried: the next sign-in shouldn't land on the previous user's page.
export function RequireSession() {
  const { status, explicitSignOut } = useSession();
  const location = useLocation();
  if (status === 'checking') return <p className="page">Loading…</p>;
  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={explicitSignOut ? undefined : { from: location }} />;
  }
  return <Outlet />;
}
