type SessionAction = 'sign_in' | 'sign_in_failed' | 'sign_in_throttled' | 'logout' | 'logout_all' | 'ended';
export type EndReason = 'expired' | 'idle' | 'password_changed' | 'reuse';

interface SessionEvent {
  accountId: number | null;
  sessionId: string | null;
  // Only for `ended`.
  reason?: EndReason;
  // Only for `logout_all`.
  sessionsEnded?: number;
}

// One stdout line per sign-in or session event: what happened, to which account and session (spec
// FR-005e). It takes ids and enums only, so a username, a password, a credential, a token, an address
// or the request body can never end up in the log. The internal session id is not the credential and
// can't be used as one. This is an operator trace, not Phase 6's persisted audit log.
export function logSessionEvent(action: SessionAction, event: SessionEvent): void {
  const line: Record<string, unknown> = { event: 'session', action };
  if (event.reason !== undefined) line.reason = event.reason;
  line.account_id = event.accountId;
  line.session_id = event.sessionId;
  if (event.sessionsEnded !== undefined) line.sessions_ended = event.sessionsEnded;
  console.log(JSON.stringify(line));
}
