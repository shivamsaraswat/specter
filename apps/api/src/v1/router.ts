import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { HttpError, mapStorageError } from './errors.js';
import { allOperations } from './openapi.js';
import { parseBody, parseId, type Method, type Operation } from './operation.js';
import { logWrite, type WriteAction } from './write-log.js';

export const v1Router = Router();

const MAX_ACCOUNT_ID = 2147483647;

// requireV1Token has already checked the token's signature and expiry (and, for a UI access token, that
// its session is still active). v1 additionally needs the account it names: a token without a usable
// numeric `sub` is rejected, never guessed at.
function requireAccount(req: Request, res: Response, next: NextFunction): void {
  const sub = typeof req.user === 'object' ? req.user.sub : undefined;
  const accountId = typeof sub === 'string' && /^\d+$/.test(sub) ? Number(sub) : 0;
  if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId > MAX_ACCOUNT_ID) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  res.locals.accountId = accountId;
  next();
}

const WRITE_ACTIONS: Partial<Record<Method, WriteAction>> = { post: 'create', patch: 'update', delete: 'delete' };

function idOf(record: unknown): string | undefined {
  if (typeof record !== 'object' || record === null || !('id' in record)) return undefined;
  return typeof record.id === 'string' ? record.id : undefined;
}

function handle(op: Operation<unknown>): RequestHandler {
  return async (req, res) => {
    try {
      const id = op.path.includes(':id') ? parseId(req.params.id) : '';
      const body = op.body ? parseBody(op.body.schema, req.body, op.method === 'patch') : undefined;
      const accountId = res.locals.accountId as number;

      const result = await op.handler({ id, body, accountId });

      // The write has happened by now, so it is logged even if building the response fails.
      const action = WRITE_ACTIONS[op.method];
      if (action && op.recordType) logWrite(accountId, action, op.recordType, action === 'delete' ? id : (idOf(result) ?? id));

      if (op.status === 204) {
        res.status(204).end();
        return;
      }
      // Every success body is parsed with the shared record schema, so what is sent is what the
      // contract says and a stray column is a server bug, not a leak (FR-011, research #8).
      const payload = op.response ? (op.response.list ? op.response.schema.array() : op.response.schema).parse(result) : result;
      res.status(op.status).json(payload);
    } catch (err) {
      const mapped = err instanceof HttpError ? err : mapStorageError(err, op.method === 'delete' ? 'delete' : 'write');
      if (!mapped) throw err;
      res.status(mapped.status).json({ error: mapped.message });
    }
  };
}

const register: Record<Method, (path: string, handler: RequestHandler) => unknown> = {
  get: (path, handler) => v1Router.get(path, handler),
  post: (path, handler) => v1Router.post(path, handler),
  patch: (path, handler) => v1Router.patch(path, handler),
  delete: (path, handler) => v1Router.delete(path, handler),
};

v1Router.use(requireAccount);
for (const op of allOperations) register[op.method](op.path, handle(op));

// Express decodes a path parameter itself, before parseId runs, and throws a URIError (status 400)
// for one that cannot be percent-decoded, such as "%zz". Every v1 parameter is an id, so that is a
// malformed id (FR-007). The error's own message echoes the value, so it is never sent.
v1Router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof URIError) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  next(err);
});
