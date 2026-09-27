import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { requireAuth } from './auth.js';
import loginRouter from './routes/login.js';
import threatsRouter from './routes/threats.js';
import usersRouter from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Liveness check for the load balancer: no auth, no DB dependency.
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/login', loginRouter);
app.use('/api/threats', requireAuth, threatsRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api', (_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

interface BodyParserError extends Error {
  type?: string;
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
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
