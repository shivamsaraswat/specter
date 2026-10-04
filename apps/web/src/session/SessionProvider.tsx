import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '../api/session.js';
import type { Account } from '../api/session.js';

const ENDED_MESSAGE = "Your session has ended. Anything you hadn't saved was not kept.";

export interface SessionValue {
  // `checking` is the boot-time attempt to restore a session from the cookie.
  status: 'checking' | 'signed-in' | 'signed-out';
  account: Account | null;
  // Set only when a session that was signed in during this page's life dies mid-use.
  endedMessage: string | null;
  // True after the user logged out on purpose, so the next sign-in doesn't return to the old page.
  explicitSignOut: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}

type State = Pick<SessionValue, 'status' | 'account' | 'endedMessage' | 'explicitSignOut'>;

const SIGNED_OUT: State = { status: 'signed-out', account: null, endedMessage: null, explicitSignOut: false };

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ ...SIGNED_OUT, status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    // A first visit, or a visit after a logout, finds no session. That is "not signed in", not an
    // ended session, so it shows no message.
    api.renew().then(
      (account) => {
        if (!cancelled) setState({ status: 'signed-in', account, endedMessage: null, explicitSignOut: false });
      },
      () => {
        if (!cancelled) setState(SIGNED_OUT);
      },
    );
    // Only a session that was signed in dies "mid-use". Stale requests failing after a logout don't count.
    const off = api.onSessionEnded(() => {
      setState((previous) => (previous.status === 'signed-in' ? { ...SIGNED_OUT, endedMessage: ENDED_MESSAGE } : previous));
      queryClient.clear();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [queryClient]);

  const signIn = useCallback(async (username: string, password: string) => {
    const account = await api.signIn(username, password);
    setState({ status: 'signed-in', account, endedMessage: null, explicitSignOut: false });
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

  const value = useMemo<SessionValue>(
    () => ({ ...state, signIn, logout, logoutAll }),
    [state, signIn, logout, logoutAll],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
