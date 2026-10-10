import { STATUS_CODES } from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { requireApiToken, requireV1Token } from './auth.js';
import config from './config.js';
import loginRouter from './routes/login.js';
import sessionRouter from './routes/session.js';
import usersRouter from './routes/users.js';
import { securityHeaders } from './security-headers.js';
import { v1Router } from './v1/router.js';
import { webHandler } from './web.js';

interface AppOptions {
  // The directory holding the built web app. When it is unset the app serves the API only.
  webRoot?: string;
  // Express's `trust proxy` value. It defaults to the TRUST_PROXY setting.
  trustProxy?: false | number | string;
}

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

// Every path the app doesn't serve gets the same JSON 404, inside or outside /api (FR-012).
function jsonNotFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

// Express 5 forwards async handler rejections here.
function errorHandler(err: BodyParserError, _req: Request, res: Response, _next: NextFunction): void {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Payload too large' });
    return;
  }
  // Any other client error, such as an unsupported content encoding (415), keeps its own status with
  // the standard text for it. The error's message is never sent: it can echo the request.
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: STATUS_CODES[err.status] ?? 'Bad Request' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? config.trustProxy);
  // First, so every response carries the headers, errors and JSON ones included.
  app.use(securityHeaders);
  // Not for /api/v1: it authenticates a request before it reads a body, and each operation sets its own limit (research
  // #2). The pattern ignores case because Express matches routes without regard to it.
  const readJson = express.json({ limit: '100kb' });
  app.use((req: Request, res: Response, next: NextFunction) => (/^\/api\/v1(\/|$)/i.test(req.path) ? next() : readJson(req, res, next)));

  // Liveness check for the load balancer: no auth, no DB dependency.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/login', loginRouter);
  app.use('/api/session', sessionRouter);
  // /api/users takes only an /api/login token; /api/v1 also takes a UI access token for an active session.
  app.use('/api/users', requireApiToken, usersRouter);
  app.use('/api/v1', requireV1Token, v1Router);

  // Anything else under /api is a JSON 404, never the UI's page. An unknown /api/v1 path without a
  // token already got its 401 above.
  app.use('/api', jsonNotFound);
  if (options.webRoot) app.use(webHandler(options.webRoot));
  app.use(jsonNotFound);
  app.use(errorHandler);
  return app;
}

// The API-only app that the contract tests import.
export default createApp();
