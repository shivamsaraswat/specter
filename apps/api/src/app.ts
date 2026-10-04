import { STATUS_CODES } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { requireAuth } from './auth.js';
import loginRouter from './routes/login.js';
import usersRouter from './routes/users.js';
import { v1Router } from './v1/router.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Liveness check for the load balancer: no auth, no DB dependency.
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/login', loginRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/v1', requireAuth, v1Router);

// Every path the app doesn't serve gets the same JSON 404, inside or outside /api (FR-012). A web
// app mounted ahead of this (Milestone 6) takes over the paths it serves.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

// Express 5 forwards async handler rejections here.
app.use((err: BodyParserError, _req: Request, res: Response, _next: NextFunction) => {
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
});

export default app;
