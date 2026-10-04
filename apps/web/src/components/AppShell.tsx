import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { useSession } from '../session/SessionProvider.js';
import { ConfirmDialog } from './ConfirmDialog.js';

// The signed-in frame: the product name, who is signed in, Log out, and Sign out everywhere, which
// ends every session of the account and so asks first.
export function AppShell() {
  const { account, logout, logoutAll } = useSession();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  async function onLogout(): Promise<void> {
    await logout();
    void navigate('/login', { replace: true });
  }

  async function onLogoutAll(): Promise<void> {
    setConfirming(false);
    await logoutAll();
    void navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="shell-header">
        <Link to="/projects">Specter</Link>
        <div className="actions">
          <span>{account?.username}</span>
          <button type="button" onClick={() => void onLogout()}>
            Log out
          </button>
          <button type="button" onClick={() => setConfirming(true)}>
            Sign out everywhere
          </button>
        </div>
      </header>
      {confirming && (
        <ConfirmDialog
          title="Sign out everywhere"
          message="Sign out on every device? You'll need to sign in again everywhere."
          confirmLabel="Sign out everywhere"
          onConfirm={() => void onLogoutAll()}
          onCancel={() => setConfirming(false)}
        />
      )}
      <main>
        <Outlet />
      </main>
    </>
  );
}
