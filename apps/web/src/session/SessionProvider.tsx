import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as api from '../api/session.js';
import type { Account } from '../api/session.js';

const ENDED_MESSAGE = "Your session has ended. Anything you hadn't saved was not kept.";

// Something on screen that has work the server has not got yet, such as the diagram editor. While the
// session is alive it only says how much; when the session ends it lets that work be saved after all.
export interface UnsavedWorkGuard {
  count(): number;
  // The same account has signed in again: carry on saving.
  onResumed(): void;
}

export interface SessionValue {
  // `checking` is the boot-time attempt to restore a session from the cookie. `reauth-required` is a session
  // that ended while there was unsaved work: the page stays, and the same account may sign in again over it.
  status: 'checking' | 'signed-in' | 'signed-out' | 'reauth-required';
  account: Account | null;
  // While `reauth-required`: how many changes wait to be saved.
  unsaved: number;
  // Set only when a session that was signed in during this page's life dies mid-use.
  endedMessage: string | null;
  // True after the user logged out on purpose, so the next sign-in doesn't return to the old page.
  explicitSignOut: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  // Registers unsaved work; the returned function takes it away again.
  registerUnsavedWork: (guard: UnsavedWorkGuard) => () => void;
  // How many changes are unsaved right now, across everything registered.
  unsavedCount: () => number;
  // Signs the account in again, over the page, to save what is waiting. A wrong password throws.
  reauth: (password: string) => Promise<void>;
  // Gives up on what is waiting and signs out, saying how much was lost.
  discardAndSignOut: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}

type State = Pick<SessionValue, 'status' | 'account' | 'endedMessage' | 'explicitSignOut' | 'unsaved'>;

const SIGNED_OUT: State = { status: 'signed-out', account: null, endedMessage: null, explicitSignOut: false, unsaved: 0 };

const lostMessage = (count: number): string =>
  `Your session ended before ${count} diagram ${count === 1 ? 'change was' : 'changes were'} saved. ${count === 1 ? 'It was' : 'They were'} not saved.`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ ...SIGNED_OUT, status: 'checking' });
  const guards = useRef(new Set<UnsavedWorkGuard>());
  const unsavedCount = useCallback(() => [...guards.current].reduce((sum, guard) => sum + guard.count(), 0), []);
  const registerUnsavedWork = useCallback((guard: UnsavedWorkGuard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // A first visit, or a visit after a logout, finds no session. That is "not signed in", not an
    // ended session, so it shows no message.
    api.renew().then(
      (account) => {
        if (!cancelled) setState({ status: 'signed-in', account, endedMessage: null, explicitSignOut: false, unsaved: 0 });
      },
      () => {
        if (!cancelled) setState(SIGNED_OUT);
      },
    );
    // Only a session that was signed in dies "mid-use". Stale requests failing after a logout don't count.
    const off = api.onSessionEnded(() => {
      // A session that ends with unsaved work does not take the page away: the data stays, and the same
      // account is asked to sign in again over it (FR-020d). With nothing to save it is as it always was.
      const unsaved = unsavedCount();
      setState((previous) => {
        if (previous.status !== 'signed-in') return previous;
        return unsaved > 0 ? { ...previous, status: 'reauth-required', unsaved } : { ...SIGNED_OUT, endedMessage: ENDED_MESSAGE };
      });
      if (unsaved === 0) queryClient.clear();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [queryClient, unsavedCount]);

  const signIn = useCallback(async (username: string, password: string) => {
    const account = await api.signIn(username, password);
    setState({ status: 'signed-in', account, endedMessage: null, explicitSignOut: false, unsaved: 0 });
  }, []);

  const signOut = useCallback(
    async (call: () => Promise<void>) => {
      try {
        await call();
      } finally {
        setState({ ...SIGNED_OUT, explicitSignOut: true });
        queryClient.clear();
      }
    },
    [queryClient],
  );

  const logout = useCallback(() => signOut(api.logout), [signOut]);
  const logoutAll = useCallback(() => signOut(api.logoutAll), [signOut]);

  const discardAndSignOut = useCallback(() => {
    setState((previous) => ({ ...SIGNED_OUT, endedMessage: lostMessage(previous.unsaved) }));
    queryClient.clear();
  }, [queryClient]);

  const reauth = useCallback(
    async (password: string) => {
      const username = state.account?.username;
      if (state.status !== 'reauth-required' || !username) return;
      const account = await api.signIn(username, password);
      if (account.id !== state.account?.id) {
        // Not the account whose changes these are: they must not be saved under another name.
        await api.logout().catch(() => undefined);
        discardAndSignOut();
        return;
      }
      setState({ status: 'signed-in', account, endedMessage: null, explicitSignOut: false, unsaved: 0 });
      for (const guard of [...guards.current]) guard.onResumed();
    },
    [state.status, state.account, discardAndSignOut],
  );

  const value = useMemo<SessionValue>(
    () => ({ ...state, signIn, logout, logoutAll, registerUnsavedWork, unsavedCount, reauth, discardAndSignOut }),
    [state, signIn, logout, logoutAll, registerUnsavedWork, unsavedCount, reauth, discardAndSignOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
