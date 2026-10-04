import type { NextFunction, Request, Response } from 'express';

// The strict policy for the built UI (spec FR-022). Everything loads from the app's own origin, there
// is no inline script or style and no evaluated code, the page can't be framed, and forms submit only
// to the app. The build is shaped to fit it with no exceptions (apps/web/test/build-output.test.ts).
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Sent on every response, JSON ones included. This is the Phase 6 security-headers item, brought
// forward into Phase 1 Milestone 6 at the maintainer's direction (plan.md, Complexity Tracking).
// There is no Strict-Transport-Security: that belongs to the TLS-terminating proxy, and sending it
// over the plain-HTTP local quickstart would do nothing.
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}
