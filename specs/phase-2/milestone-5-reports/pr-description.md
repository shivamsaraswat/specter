# Phase 2 / Milestone 5: reports

Spec, plan and tasks: [`specs/phase-2/milestone-5-reports/`](./). **Constitution amendment 1.9.0 → 1.10.0**
(see [Threat Model and constitution](#threat-model-and-constitution)).

> **For API clients: one new operation, `GET /api/v1/threat-models/{id}/report?format=markdown|html`.** It answers
> with a file (an attachment), not JSON. Nothing else changes. See [`API.md`](../../../API.md#downloading-a-report).

## Summary

- **Download a report of the whole threat model (US1, US2).** Two buttons on the threat model page, on both views,
  and one API operation behind them. The web app downloads through the operation, as any client would, so both get
  the same document.
  - **Markdown**: header, risk summary (the numbers of the Threats view), the diagram as a Mermaid flowchart, every
    element grouped by trust boundary, the threats not linked to an element.
  - **HTML**: the same content in one self-contained file that opens and prints offline, with the diagram drawn at the
    canvas's positions. "Save as PDF" in the browser makes the PDF; no headless browser was added.
- **Read each threat in the context of the system (US3).** Every element section says what it is (technology tags,
  each security flag as Yes / No / Not assessed) and, for a flow, what it joins and whether it crosses a trust boundary,
  before its threats. "Crosses" is the rule engine's own answer, so a report and a "Generate threats" run can't disagree.
- **One model, two renderers.** `buildReport` is a pure function over one snapshot; the Markdown and HTML renderers
  draw only from its result, so they can't differ. The snapshot is read in one repeatable-read, read-only
  transaction, so a report never holds a mitigation without its threat.
- **Byte-stable.** An unchanged threat model gives the same file, apart from the export time in its header (names
  order by code point, ids by position, UTC throughout), so a report kept in a repository shows real changes.
- **Safe text in three dialects.** Whatever a user typed is shown as typed and can't become markup: every ASCII
  punctuation mark escaped in Markdown, decimal entities in a Mermaid label, the five characters in HTML. The HTML
  file is inert by its own policy: first in its head, a `<meta>` Content-Security-Policy allows no script and nothing
  from outside but its one stylesheet, by hash.
- **Too big to draw.** A diagram of more than 400 flows (or a flowchart over 40,000 characters) is replaced in the
  Markdown by a note, because GitHub and others show an error box above Mermaid's limits; the element sections give
  the same structure as text, and the HTML draws all of it.

Also changed: `API.md`, `README.md` (operation count), the constitution, the OpenAPI file.

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | Four Kysely reads in one transaction; no raw SQL. The `format` query is validated by a shared schema in `packages/core` (`ReportQuery`), as `/api/v1` input must be; a missing, unknown or repeated value, or an extra key, gets one fixed message that repeats nothing. The operation is mounted from the table behind the existing token check (the auth test counts 29). The file name is a slug set through `res.attachment`; no token is in an address, a file name or a document. |
| **II. Test-first** | See [the test notes below](#tests-and-what-i-did-and-did-not-watch-fail). `quickstart.md` §1 maps every requirement to a suite. |
| **III. Simplicity** | No table, no migration, no runtime dependency, no new package, no worker, no compression. The operation table gained a validated query and a text response so the router and the OpenAPI document are still generated from one table. Three **test-only** dev dependencies (below). |
| **IV. Maintainability** | No new environment variable. The stylesheet is a string constant, so `tsc` and the Dockerfile are unchanged. No log line added; a report's content is never logged (tested). |
| **V. Least privilege / Threat Model** | New entry point, so the Threat Model section is updated (below). It widens nothing: any account could already read every record a report holds. |
| **VI. AI output is a draft** | No AI code. Each threat shows its stored origin (an `ai` origin prints as "AI-drafted" and is tested, though none can exist yet); stale and "missing what its status needs" markers are carried in, so a printed report never presents an incomplete decision as complete. |

## Security implications

- **User text now leaves the app in three formats.** This is the main risk of the milestone, and the tests use real
  parsers rather than string matching: a CommonMark + GFM parser for the Markdown, **real Mermaid in a browser with no
  network** for the flowchart (all 22 hostile names, including `-->`, `end`, backticks, quotes, `#35;` and `<script>`,
  come back as typed), and a browser opening the HTML **from disk with no network**, listening for policy violations
  and for any request (none).
- **The HTML file is a document someone will open later, outside Specter's protections.** Hence the `<meta>` policy
  with a hashed stylesheet, no `style` attribute and no script anywhere, and `sandbox; default-src 'none'` on the API
  response in case it is ever shown at Specter's origin. Ticket links are links only for http(s).
- **Accepted risk: a report is a copy of a whole threat model outside the app, on purpose.** Once downloaded, Specter
  can neither protect nor revoke it. It holds no credential, account name or account id, and the response is `no-store`.
- **Accepted risk: render cost.** A report is built in the API process; for the largest model Milestone 3 allows it was
  measured under a second (below). It takes no lock. Revisit with the worker (Phase 3) or rate limiting (Phase 6).

## Threat Model and constitution

Constitution **1.9.0 → 1.10.0** (MINOR): the Sync Impact Report; the trust-boundaries list (the new endpoint); and the
Tampering, Information Disclosure and Denial of Service bullets.

## Measurements

The built app, in a real browser, on a developer machine with Postgres in Docker (`report-large.spec.ts` prints each).
The largest model is the one Milestone 3 allows: 1,000 elements, 15,000 threats, about 49,000 mitigations, with the
count asserted and every threat counted exactly once in both files.

| Target | Local build | `docker compose up --build` | Size |
|---|---|---|---|
| SC-004, typical model (50 elements), Markdown, under 2 s | **94 ms** | **144 ms** | 0.3 MB |
| SC-004, typical model, HTML, under 2 s | **63 ms** | **227 ms** | 0.6 MB |
| SC-004, largest model, Markdown, under 15 s | **699 ms** | **816 ms** | 12.8 MB |
| SC-004, largest model, HTML, under 15 s | **680 ms** | **915 ms** | 20.5 MB |

The page stays usable while a bound-sized report is made (the test opens the Diagram view during the download). All
seven report specs, the Definition-of-Done walkthrough (SC-007) among them, also passed against `docker compose up
--build`.

## Tests, and what I did and did not watch fail

All passing, plus typecheck, lint and the licence check: core 261, threat-library 314, db 232, api 705, web 580,
scripts 37, browser 50. The Docker image builds, and contains none of the three new dev packages.

- **Watched fail before the code:** every Foundational test (moved placement and stale-text, model, filename,
  snapshot), the Markdown, Mermaid, HTML and SVG renderer tests, the core `ReportQuery` test, the report contract test,
  and the `ExportReport` component test, each on a missing module or behaviour.
- **Bugs the tests caught in my own first versions:** the slug turned an accent into a hyphen (`é` → `e-`); the
  "outside any boundary" group adopted the top-level boundaries as children and numbered them twice; `Route is
  already handled` and a held save that was never released, in the browser spec.
- **Bugs found by looking at the real output**, not by a test: rendering the HTML report to a PDF and reading its
  pages showed a flow label hiding its own arrow. Labels now sit beside their line (on opposite sides for flows that
  share two shapes), and carry a thin outline instead of a box, because the box I first added erased text of other
  shapes. Tests were added for both.
- **A regression I caused and fixed:** the new button group first reused the class `generate-bar`, and every existing
  browser spec finds the generate status by `.generate-bar [role="status"]`. It has its own class now.

## Things you should know

- **The Docker containers.** `specter-app-1` and `specter-db-1` stopped by themselves (clean exits) twice while I
  worked. I started `specter-db-1` again for the tests, and later ran `docker compose up --build -d` for the compose
  measurements, so the stack is now **running on port 3000 with this branch's code**.
- **`bound.ts` instead of `fixtures.ts`.** The 1,000-element seeding the large specs share moved into
  `apps/web/e2e/bound.ts`, so `fixtures.ts` stays generic. `threat-workflow-large.spec.ts` imports it; nothing in it changed.
- **Marker names in tests are alphanumeric** (`Tmk0001`), not `T-0001`, because Markdown escapes the hyphen.
- **The bound model draws its flowchart.** 1,000 *unconnected* elements are only about 23,000 characters of Mermaid
  and no edges, so they are under both limits. The "too large" note is tested end to end with a diagram of 401 flows.
- **A cramped diagram can still put a label over another shape's caption.** Straight lines and automatic labels can't
  avoid every overlap; the listings under Elements carry the same information, and the picture says so in its caption.
- **The root `plan.md` is not edited.** Milestone 7 will commit an export of Specter's own threat model; this
  report is what it will use.
- **README's "current status" paragraph was already out of date** (it still lists rule-generated threats as to come). I
  left it alone: it isn't this change's to rewrite.

## Manual checks

I could not do these myself, and I have not. The author ran the `quickstart.md` §4 checks and reported that they
work: GitHub's own rendering of a Markdown report (hostile text and the Mermaid block), "Save as PDF" in other
browsers, and a screen reader over the HTML report. No per-item notes were taken, so nothing finer than "works" is
claimed here.

What I did check, with Chromium only: the PDF of a 56-threat model is 31 pages, every threat whole on its page,
statuses and risks told apart by border style in black and white. For the screen reader, the tests check that the
markup exists (`h1` to `h6`, `table` with `caption` and `th scope`, `figure` with `figcaption`, `dl`).

## Dependencies

No runtime dependency. Three **dev** dependencies, none in the production image (checked in the built image):

| Package | In | Why |
|---|---|---|
| `micromark`, `micromark-extension-gfm` | `apps/api` | Renders the Markdown report in unit tests, to show that hostile text stays text (FR-014, SC-005). |
| `mermaid` | `apps/web` | Draws the report's flowchart in a browser test, and supplies the limits the "too large" threshold is checked against. |
