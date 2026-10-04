import path from 'node:path';
import express, { type RequestHandler } from 'express';

// Serves the built UI (spec FR-021, contracts/serving.md). It is one plain middleware, not a wildcard
// route: Express 5's path matching rejects a bare `*`.
//
// The rule that tells a file from a page address is deterministic: a request is for a *file* when the
// last path segment contains a dot, or the path is under /assets/. A file is served if it exists and
// otherwise falls through to the app's JSON 404, so a broken deployment fails visibly instead of
// answering a missing script with an HTML page. Every other GET or HEAD is a *page address*, which
// the UI's router resolves, so it gets index.html. Other methods fall through to the JSON 404.
export function webHandler(webRoot: string): RequestHandler {
  const files = express.static(webRoot, {
    index: false,
    fallthrough: true,
    dotfiles: 'ignore',
    setHeaders: (res, filePath) => {
      const relative = path.relative(webRoot, filePath);
      if (relative === 'index.html') res.setHeader('Cache-Control', 'no-cache');
      // Built assets carry a content hash in their names, so they can be cached for good.
      else if (relative.startsWith(`assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const lastSegment = req.path.split('/').pop() ?? '';
    if (lastSegment.includes('.') || req.path.startsWith('/assets/')) {
      files(req, res, next);
      return;
    }
    res.sendFile('index.html', { root: webRoot, headers: { 'Cache-Control': 'no-cache' } }, (err) => {
      if (err) next(err);
    });
  };
}
