# Contract: Serving the UI, and Security Headers

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) #13, #14

## Request routing (production app, with a built web root)

Rules are checked in order, and the first match wins.

| # | Request | Response |
|---|---|---|
| 1 | `GET /health` | `200 { "status": "ok" }`. No auth, no database (unchanged). |
| 2 | `/api/login`, `/api/session…`, `/api/users…`, `/api/v1…` | Their own contracts. An unknown `/api/v1` path without a token still gets 401 first. |
| 3 | Any other path under `/api/` (any method), including `/api/threats` | `404 { "error": "Not found" }`, as JSON |
| 4 | Method other than `GET` or `HEAD` | `404 { "error": "Not found" }`, as JSON |
| 5 | **File request**: last path segment contains `.`, or path starts with `/assets/` | The file from the web root if it exists. Otherwise `404 { "error": "Not found" }`, as JSON. |
| 6 | Any other `GET`/`HEAD` (**page address**) | `200`, the web root's `index.html` (`Content-Type: text/html`) |

Without a web root (the default `createApp()` the API tests use, or a server started without a
built UI), rules 5 and 6 don't exist, and those requests get the JSON 404 from rule 3 or 4, or the
final 404.

**Required outcomes**:

| Request | With web root | Without web root |
|---|---|---|
| `GET /` | UI | JSON 404 |
| `GET /index.html` | UI (the file) | JSON 404 |
| `GET /app.js` | JSON 404 | JSON 404 |
| `GET /style.css` | JSON 404 | JSON 404 |
| `GET /nope` | UI (in-app "not found") | JSON 404 |
| `GET /projects/<uuid>` | UI | JSON 404 |
| `HEAD /` | 200, no body | JSON 404 status |
| `POST /` , `PUT /nope` | JSON 404 | JSON 404 |
| `GET /assets/<missing>.js` | JSON 404 | JSON 404 |
| `GET /api/threats`, `GET /api/nope` | JSON 404 | JSON 404 |
| `GET /.hidden-config` (any dotfile) | JSON 404 (dotfiles ignored) | JSON 404 |

**Cache headers**:

- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`.
- `index.html`, whether served by rule 5 or rule 6: `Cache-Control: no-cache`.

## Security headers (every response, every path, every status)

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

- `X-Powered-By` stays disabled.
- No `Strict-Transport-Security` header: that belongs to the TLS-terminating proxy.
- No CORS headers, so cross-origin preflights fail.

**Build constraints that keep the policy exception-free**:

- `dist/index.html` contains no inline `<script>` (only `<script type="module" src="/assets/…">`),
  no `<style>`, and no `style=` attribute.
- No `data:` URIs: `build.assetsInlineLimit: 0`.
- No runtime `<style>` injection by any bundled library.
- No request to another origin (FR-023).
