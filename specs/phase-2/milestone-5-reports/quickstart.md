# Quickstart: validating Reports (Phase 2 / Milestone 5)

## 1. Automated suites

Everything runs in CI's required `test` check. No workflow change is needed.

| Suite | Where | Proves |
|---|---|---|
| Placement, labels and stale text (moved) | `packages/core/test/placement.test.ts`, `stale-text.test.ts` (moved from web, unchanged assertions) | research #5: same behaviour after the move |
| Report query schema | `packages/core/test/report.test.ts` | `ReportQuery` accepts only the shipped formats, with one message for a missing, unknown or repeated value or an extra key (Principle I, data-model.md §5) |
| Report model | `apps/api/test/report/model.test.ts` | data-model.md §4 invariants: each record exactly once, boundary grouping and flow assignment (research #6), ordering (FR-012), references for repeated names, summary = `summarizeThreats` (FR-004), gap and stale text (FR-010), determinism under shuffled input (FR-013) |
| Markdown | `apps/api/test/report/markdown.test.ts` | outline and wording (contracts/report-format.md); hostile fixture rendered with micromark + GFM: no foreign links, images, HTML, headings, lists or tables, and literal text (FR-014, SC-005); ticket links only for http(s) (FR-015); empty model; byte-identical output apart from the timestamp line (SC-003) |
| Mermaid | `apps/api/test/report/mermaid.test.ts` | output depends only on the diagram (invariant 6); shapes per type, nested subgraphs, labels fully entity-encoded, ids never user text; the threshold at 40,000 characters / 400 edges and the note above it (FR-007a). Checking the constants against Mermaid's own limits is in `report-render.spec.ts`. |
| HTML and SVG | `apps/api/test/report/html.test.ts`, `svg.test.ts` | CSP meta first in `<head>`, and its hash matches the embedded stylesheet; no `style=` attribute and no `<script>`, `<link>`, `<img>` or `url(` other than `#arrow`; escaping of every field; viewBox with negative coordinates; positions equal `absoluteRects`; parallel flows offset; truncated labels carry a `<title>` |
| File name | `apps/api/test/report/filename.test.ts` | slugging, the fallback, the 60-character cut, the UTC date (research #13) |
| API contract | `apps/api/test/contract/v1/reports.test.ts` | contracts/report-api.md table: headers, 400/401/404, every record exactly once against a real database, snapshot consistency, two exports |
| Auth, validation and OpenAPI | `auth.test.ts` (29), `validation.test.ts` (29; the 404 loop sends `?format=markdown`), `openapi.test.ts` (30) | the new operation is authenticated, validated in the documented order, and documented |
| Web component | `apps/web/src/components/ExportReport.test.tsx` | contracts/web-ui.md states |
| Browser: Definition of Done | `apps/web/e2e/report.spec.ts` | §2 below (SC-001, SC-007) |
| Browser: inert HTML and real Mermaid | `apps/web/e2e/report-render.spec.ts` | §3 below (FR-016, FR-007, FR-007a's limits, SC-005) |
| Browser: bound | `apps/web/e2e/report-large.spec.ts` | §5 below (FR-022, SC-004) |

Run locally:

```sh
pnpm test                                     # unit + contract (needs the test Postgres, as today)
pnpm --filter @specter/web test:e2e -- report # the three browser suites, against the built app
```

## 2. Definition of Done walkthrough (`report.spec.ts`)

1. Sign in. Create a project and a threat model.
2. On the Diagram view:
   - draw a trust boundary "Internal network" holding the process "API" and the data store "Orders
     DB";
   - draw an external entity "Browser" outside it;
   - draw the flows "HTTPS request" (Browser → API) and "SQL" (API → Orders DB).
3. Generate threats. On one threat:
   - set it to accepted with a reason;
   - add a mitigation, mark it implemented, and set the threat to mitigated.
4. Click **Download Markdown report**. Expect a download named `<slug>-report-<today UTC>.md`. Read
   it and check:
   - the header;
   - the summary equals the Threats view's summary;
   - a ```` ```mermaid ```` block with one `subgraph` and two edges;
   - an "E… · Trust boundary · Internal network" group holding API, Orders DB and the "SQL" flow;
   - "Browser" and the "HTTPS request" flow (marked as crossing a trust boundary) under "Outside any
     trust boundary";
   - every generated threat exactly once.
5. Click **Download HTML report**. Expect a `.html` download.
6. With a diagram change still being saved (hold the batch request with `page.route`), click a
   download button. Expect the confirm dialog. Cancel, and check that nothing downloaded.

## 3. Rendering checks (`report-render.spec.ts`)

- **The HTML file, inert and offline**:
  1. Seed the hostile fixture (contracts/report-format.md) through the API, and download its HTML
     report.
  2. In a new context, abort every route and open the file with `page.goto('file://…')`.
  3. Collect `securitypolicyviolation` events and requests.
  4. Expect:
     - no requests and no violations;
     - `window.__ran` undefined;
     - each hostile string present as text (`getByText(…, { exact: true })`);
     - links only for the http(s) tickets;
     - the SVG drawn with an arrowhead on each flow.
  5. Under `page.emulateMedia({ media: 'print' })`, check the computed print rules:
     - `break-inside: avoid` on `.threat`, the summary tables and the figure;
     - `break-after: avoid` on element and threat headings;
     - `page.pdf()` succeeds.

     Whether pages actually break well is checked by eye in §4 (FR-019).
- **Real Mermaid**:
  1. In a blank page with routes aborted, add the installed `mermaid` bundle with
     `page.addScriptTag({ path })`.
  2. Render the hostile fixture's flowchart, taken from its Markdown report.
  3. Expect no parse error, one node per element, one cluster per boundary and one edge per flow, and
     every label's text equal to the element or flow name.
  4. Read Mermaid's default `maxTextSize` and `maxEdges` from its runtime config in the page. Check that
     the report's threshold constants (40,000 / 400) are below them (FR-007a, research #9).

## 4. Manual checks (once per milestone, results recorded in the PR)

1. **GitHub rendering** (research #8: micromark stands in for cmark-gfm):
   - commit the hostile fixture's Markdown report to a private scratch repository and open it on
     GitHub;
   - expect literal text everywhere, no extra links, and the flowchart drawn.
2. **Save as PDF**: in current Chrome, Firefox and Safari, open the §2 HTML report from disk, print it
   to PDF, and look at it in black and white (FR-019, FR-020):
   - every page breaks between threats;
   - the diagram fits the page width;
   - statuses and risks are readable without colour.
3. **Screen reader**: VoiceOver or NVDA over the HTML report. Headings navigate, the summary tables
   announce their headers, and the diagram announces its caption (FR-021).

## 5. Bound (`report-large.spec.ts`)

1. Seed the largest threat model Milestone 3 allows (1,000 elements, about 15,000 threats, about
   49,000 mitigations) with the existing bound helpers (`threat-workflow-large.spec.ts`).
2. Download each format from the Threats view. Each must finish in under 15 seconds (SC-004). Also
   seed the typical model (50 elements, about 500 threats): each format must finish in under 2
   seconds (SC-004).
3. While the download runs, switch to the Diagram view and back. The tab must answer, because the
   page isn't frozen.
4. The Markdown must hold the FR-007a note, not a flowchart.
5. The measured times and file sizes from `report-large.spec.ts`, from the click until the file is
   complete. "Local build" is the built app (`node apps/api/dist/server.js`) on a developer machine with
   Postgres in Docker; "Compose" is the shipped app, `docker compose up --build`, run with
   `PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter @specter/web test:e2e report`. All seven report
   specs, the Definition-of-Done walkthrough of §2 among them, passed against Compose.

| Model | Format | Local build | Compose | Size | Limit |
|---|---|---|---|---|---|
| Typical (50 elements, 500+ threats) | Markdown | 94 ms | 144 ms | 0.3 MB | 2 s |
| Typical | HTML | 63 ms | 227 ms | 0.6 MB | 2 s |
| Bound (1,000 elements, 15,000 threats) | Markdown | 699 ms | 816 ms | 12.8 MB | 15 s |
| Bound | HTML | 680 ms | 915 ms | 20.5 MB | 15 s |

   The same run checks a diagram of 401 flows: the Markdown holds the note and all 401 flow sections, and
   the HTML draws all 401 arrows (FR-007a).

## 6. API by hand

```sh
TOKEN=$(curl -sS -X POST localhost:3000/api/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"…"}' | jq -r .token)
curl -sS -D - -o /dev/null -H "Authorization: Bearer $TOKEN" \
  "localhost:3000/api/v1/threat-models/$ID/report?format=html"           # 200 + headers in contracts/report-api.md
curl -sS -H "Authorization: Bearer $TOKEN" \
  "localhost:3000/api/v1/threat-models/$ID/report?format=pdf"            # 400 {"error":"format must be markdown or html"}
```
