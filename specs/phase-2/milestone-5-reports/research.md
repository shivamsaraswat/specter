# Research: Reports (Phase 2 / Milestone 5)

Each decision answers one open question from the plan's Technical Context. Every decision names
the spec requirements it serves.

## 1. One operation, two formats

**Decision**: `GET /api/v1/threat-models/{id}/report?format=markdown|html`.

- `format` is required, and only those two values are allowed. Anything else, a missing value or a
  repeated value gets `400 { error: "format must be markdown or html" }`.
- An unknown threat model gets `404 { error: "Threat model not found" }`, the same as every other
  read (FR-002a).
- **Success** is `200` with the document as text:
  - `Content-Type: text/markdown; charset=utf-8` or `text/html; charset=utf-8`;
  - `Content-Disposition: attachment; filename=…` (#13);
  - `Cache-Control: no-store`, because the document is a whole threat model and nothing should keep
    a copy.
- **The HTML response** also gets `Content-Security-Policy: sandbox; default-src 'none'` in place of
  the app's policy. The API only answers with a bearer token, so a browser can't navigate to it. If
  the file were ever shown at Specter's origin, it would still run nothing and could reach nothing.

**Rationale**: the user chose one API operation that returns either format on request
(Clarifications, Q4). A query parameter names the format explicitly, in a link or in a script.
`Accept` negotiation is easy to get wrong with `curl`, and a browser can't set it in a download.
`attachment` keeps a browser from rendering the HTML inline.

**Alternatives considered**:

- Two paths, `/report.md` and `/report.html`: two operations, against the clarified "one operation".
- `Accept` header: rejected above.
- A JSON envelope `{ markdown }`: API clients would have to unwrap it, and the web app would hold
  every report twice.

## 2. Extending the operation table, not working around it

**Decision**: `Operation` (`apps/api/src/v1/operation.ts`) gains two optional members.

- **`query`**: `{ name, schema }`, a zod schema for `req.query`. The schema itself is shared, in
  `packages/core/src/schemas/report.ts` (`REPORT_FORMATS`, `ReportQuery`), because Principle I
  requires `/api/v1` input to be validated by the shared core schemas. `apps/api` only refers to it,
  and types its renderer map by core's `ReportFormat`, so a format without a renderer (or the
  reverse) is a type error.
  - The router parses it the same way it parses the body: a failure is a 400 built by
    `formatValidationError`.
  - Express 5's default parser gives a string or an array. The schema accepts only a single string
    from the enum, so `?format=a&format=b` is a 400.
- **`text`**: `{ contentTypes: Record<format, string> }`, which marks an operation whose handler
  returns `{ body, contentType, filename }`.
  - For such an operation the router sends `body` as-is, with the headers from #1 and #13, and never
    uses `res.json`.
  - The response schema check (FR-011 of Phase 1 M5) doesn't apply. What it guards, sending exactly
    what the contract says, is covered by the report's own tests (quickstart §1).

`documentedOperation` in `openapi.ts` changes in two places:

- it emits the query parameter (`in: query`, `required: true`, `enum: [markdown, html]`);
- the 200 response has `text/markdown` and `text/html` content, each `{ type: string }`.

`resourceOperations` grows from 28 to 29, so `auth.test.ts`, `validation.test.ts` and
`openapi.test.ts` move to 29, 29 and 30.

**Order of checks** for the report operation:

1. the id (`400 Invalid id`);
2. the format (`400 format must be markdown or html`);
3. existence (`404 Threat model not found`).

`validation.test.ts`'s generic "404 for a well-formed id" loop therefore sends `?format=markdown` for
this operation. Its path-id loop needs no change, because the id is checked first.

**Rationale**: the router and the OpenAPI document are both built from one table so they can't
disagree (Phase 1 M5 research #3). A hand-mounted route would break that guarantee for the one
operation that most needs documenting.

**Alternatives considered**:

- A separate Express route next to `v1Router`: undocumented by construction.
- Serializing the text through `res.json`: wrong content type.

## 3. One consistent read

**Decision**: the handler reads everything in one `REPEATABLE READ` transaction
(`kdb.transaction().setIsolationLevel('repeatable read')`). It makes four queries in this order:

1. the threat model, joined to its project (for the header);
2. its elements;
3. its threats;
4. the mitigations of those threats.

The threat model query runs first, so a missing model is a `404` before any other read.

**Rationale**: four separate reads could interleave with a delete. The report could then hold a
mitigation whose threat isn't in it, or a threat whose element is gone, and SC-002 ("every threat
and mitigation exactly once") would fail. A repeatable-read snapshot makes all four see one state of
the database, and it takes no locks.

**Alternatives considered**:

- `SERIALIZABLE`: not needed for a read-only snapshot.
- One big join: it would repeat every threat once per mitigation, about 49,000 rows at the bound.

## 4. Where rendering lives

**Decision**: a new folder `apps/api/src/report/` with one concern per file:

- `snapshot.ts`: the transaction from #3, which returns plain records;
- `model.ts`: `buildReport(snapshot, exportedAt)`. A pure function that produces the **report
  model** (data-model.md §2): groups, order, references, summary, gaps and stale text. Both formats
  render this one model, so they can't show different content (FR-002).
- `markdown.ts`, `mermaid.ts`: the Markdown document. `renderMarkdown` calls `renderMermaid(report)`
  itself; the report model holds no flowchart, so the model has no dependency on a renderer;
- `html.ts`, `svg.ts`, `report-css.ts`: the HTML document. The stylesheet is a string constant in
  `report-css.ts`, so `tsc` ships it with the server and no build step or Dockerfile change is
  needed.
- `escape.ts`: the Markdown and HTML text escapers (#8, #10).
- `filename.ts`: #13.

The operation itself is declared in `apps/api/src/v1/reports.ts`, next to the other resources.

**Rationale**:

- Only the server renders reports (Clarifications, Q4), so the renderers belong to the API.
- The pieces the web app also uses (placement, labels, stale wording) move to core (#5).
- Everything after the snapshot is pure, so it is unit-tested without a database (Principle II).

**Alternatives considered**:

- A `packages/report` package: no second consumer, so YAGNI.
- Putting it in core: it would ship report code to the browser for nothing.

## 5. Moving shared, pure code into core

**Decision**: these files move from `apps/web/src` into `packages/core/src`, with their tests:

- `diagram/placement.ts` and `diagram/layout-read.ts`: where every node and boundary is drawn,
  including unplaced ones (FR-006: "or where the canvas would place it");
- `diagram/type-labels.ts` and `diagram/flag-labels.ts`: the words for types and flags;
- `components/stale-text.ts`: `describeStale`, the sentence that says why a threat is stale (FR-010).

Every web importer switches to `@specter/core`. Nothing is re-exported from the old paths, because
Principle III forbids dead code.

- `placement.ts` and `stale-text.ts` take `ElementRecord` / `StaleReason`, which are already core
  types.
- `freeSpotNear` and `freeSpotInside` move along, since they belong to the same module. Only the web
  app calls them.

**Rationale**:

- The HTML diagram must put unplaced elements where the canvas does. Re-implementing the placement
  would drift.
- The report must explain staleness in the same words the threat list uses.

**Alternatives considered**:

- The API importing from `apps/web`: crosses app boundaries, and the API build doesn't include web
  sources.
- Duplicating the code: drift.

## 6. Grouping by trust boundary

**Decision** (FR-012, Clarifications, Q5):

- **The boundary tree** comes from `parent_boundary_id`. That is stored membership, the same rule
  `resolveLayout` uses: "stored membership wins over geometry".
  - A parent that is missing, or not a boundary, counts as none.
  - A cycle is impossible by database rule. The walk still keeps a seen-set, like `absoluteRects`
    does.
- **A node** belongs to its `parent_boundary_id`.
- **A data flow** never has a parent (`elements_flow_no_parent`). It belongs to the innermost
  boundary that is an ancestor of, or equal to, the boundaries of both its source and its target:
  the deepest common ancestor of the two ends' boundary chains. If there is none, it goes in the
  outside group.
  - It **crosses a trust boundary** when its two ends are in different boundaries. Each end's
    boundary (or "outside any boundary") is named.
  - This is the same fact the rule engine calls `crosses_trust_boundary`: its ends are not inside
    exactly the same set of boundaries (M2 FR-010b). Because boundaries form a tree, that is the same
    as "the ends' innermost boundaries differ". The report takes the fact from the rule engine's
    `computeFlowContexts` (`apps/api/src/rule-engine/flow-context.ts`), so a report and a "Generate
    threats" run never disagree.
- **Inside a group**:
  1. the boundary's own threats;
  2. its elements' sections, in FR-012's order;
  3. its nested boundaries' groups, by name.
- **The outside group** comes last among element groups. "Threats not linked to an element" follows
  it (FR-009).

**Rationale**:

- Stored membership is what the canvas draws and what the elements list shows.
- The common-ancestor rule puts a flow inside the boundary that holds both ends. A flow from
  `Internet` to `API` lands in the outside group, marked as crossing.

## 7. Byte-stable output

**Decision** (FR-013, SC-003):

- **Name order** compares by Unicode code point (`a < b ? -1 : …`), never `localeCompare` or `Intl`.
  Locale sorting depends on the server's ICU data and environment, so two machines would write
  different files.
- **Comparators**:
  - Elements, inside a group: type order, then name, then id.
  - Threats: risk (Critical → Low), then STRIDE category in `STRIDE_CATEGORIES` order, then title,
    then id.
  - Mitigations: description, then id.
  - Milestone 4's `compareByRisk` breaks ties on `created_at`, so the report has its own comparator.
- **Reference numbers**: every element gets a reference `E1, E2, …` in report order (#12).
  - Mermaid ids are `n1…` for nodes and `b1…` for boundaries; SVG ids are `r-n1…`.
  - None of these are taken from UUIDs or row order.
- **The export instant**:
  - It is taken once, in UTC.
  - The header shows it as `YYYY-MM-DD HH:MM UTC`, and the file name uses its date. A report near
    midnight can't show one date in its name and another in its header.
  - It is the **only** variable text in the document.
- **Line endings** are LF, and the file ends with exactly one newline.
- **Determinism check**: `buildReport` is pure. A unit test renders the same snapshot twice with two
  instants and checks that only the timestamp line differs. The same snapshot with its row order
  shuffled must give identical bytes.

**Rationale**: Milestone 7 commits a report to the repository. Its diffs must show changes to the
threat model, not changes to the renderer's environment.

## 8. Markdown escaping

**Decision** (FR-014, SC-005): every piece of user text goes through one function,
`markdownText(value)`.

- It backslash-escapes **every ASCII punctuation character**. CommonMark allows a backslash before
  any of them, and an escaped character can't start any construct: emphasis, links, images,
  headings, lists, tables, code, HTML or entities.
- It replaces each line's leading spaces and tabs with `&#32;` / `&#9;`. This keeps indentation
  without opening an indented code block.
- It ends every line but the last with `\` + newline (a hard line break), so a multi-line description
  keeps its lines.
- A user text that spans lines is always inside a blockquote container (`> ` on every line), so a
  blank line in it can't end the threat's section.
- Only fixed labels and numbers go in tables (the risk summary). User text never goes in a table
  cell.
- **Links in Markdown**: a ticket address that is http or https becomes `<https://…>`, an autolink
  whose destination is percent-encoded for `<`, `>`, spaces and control characters. Any other
  address is plain escaped text (FR-015).

**Bare URLs inside descriptions**: GitHub's extended autolinks (`https://…`, `www.…`) are the most
likely leak. With `:` and `.` escaped, the source no longer contains the literal `https://` or `www.`
that the autolink scanner looks for.

**Verification**:

- Unit tests render each fixture with `micromark` + `micromark-extension-gfm` (test-only
  devDependencies, #16). They check that the output has no `<a>`, `<img>`, `<script>`, heading or
  table element that the report didn't emit itself, and that the rendered text equals the input.
- micromark is a faithful CommonMark + GFM implementation, but it is a **stand-in** for GitHub's
  cmark-gfm. So quickstart §4 keeps a manual check: commit the hostile fixture's report to a
  scratch repository on GitHub and look at it.

**Alternatives considered**:

- Code spans for all user text: literal, but unreadable for descriptions.
- HTML entities for everything: GitHub decodes them but some viewers don't.
- A Markdown library to *build* the document: the escaping problem is the same, and it adds a runtime
  dependency.

## 9. Mermaid flowchart

**Decision** (FR-007, FR-007a):

- **Header**: `flowchart LR`.
- **Shapes**:
  - external entity: rectangle, `n1["…"]`;
  - process: stadium, `n1(["…"])`;
  - data store: cylinder, `n1[("…")]`.

  These are distinguishable by shape alone, without colour.
- **Boundaries**: `subgraph b1["…"]` … `end`, nested as in #6. A data flow is written as an edge,
  `n1 -->|"…"| n2`, after all subgraphs, so Mermaid doesn't pull an endpoint into the wrong group.
- **Labels**: every label is the element's name. Where names repeat, the reference is added (#12).
  - Every character outside `[A-Za-z0-9 ]` is written as Mermaid's decimal entity `#NNN;`.
  - The label is inside double quotes.
  - So no user text can close the label, start a Markdown-string label (backticks), add an edge
    (`-->`), end a subgraph (`end` only matters as a bare token, never inside quotes), or inject HTML
    (`<` becomes `#60;`).
  - Node and subgraph ids are never user text.
- **Size threshold (FR-007a)**: the flowchart is included only when **both** of these hold:
  - its text is at most **40,000 characters**;
  - it has at most **400 edges**.

  Mermaid's default configuration caps diagrams at `maxTextSize` 50,000 and `maxEdges` 500. Above
  those, Mermaid draws an error box instead of the diagram. The margin leaves room for viewers
  configured below the defaults. Above the threshold the report writes FR-007a's note: *"The diagram
  has N elements and is too large to draw here. Its structure is listed under Elements below; the
  HTML report from Specter draws it in full."*

  The constants live in `apps/api/src/report/mermaid.ts`. `report-render.spec.ts` loads the
  installed `mermaid` in a page anyway (below), so it also reads Mermaid's runtime default config
  there and checks that both constants stay below its `maxTextSize` and `maxEdges`. A Mermaid upgrade
  that lowers them fails the build. Mermaid is a devDependency of `apps/web` only and needs a DOM, so
  this check lives in the browser suite, not in the API's unit tests. The exact config call is
  confirmed against the installed version when the test is written.
- **Verification**: a Playwright test (quickstart §1) loads the installed `mermaid` into a blank page
  with every network route aborted, renders the hostile fixture's flowchart, and checks:
  - there is no error;
  - one node per element, one cluster per boundary and one edge per flow;
  - the text of every node and edge label equals the name, character for character, including
    `<script>`, `` ` ``, `-->`, `end`, `"`, `#` and `;`.

  This is the only way to learn whether Mermaid decodes entities before or after it sanitizes, so it
  is a test, not an assumption.

**Alternatives considered**:

- Slug ids from names: user text in syntax.
- `graph TD`: same grammar. LR suits the usual left-to-right DFD.

## 10. An inert, self-contained HTML file

**Decision** (FR-016, FR-014):

- **The first element in `<head>`** is
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-…'; img-src 'none'; base-uri 'none'; form-action 'none'">`.
  - The hash is computed once, at module load, from the exact stylesheet string in `report-css.ts`
    that is embedded in the `<style>` element.
  - So no script runs, no resource loads, and no other style applies, whether the file is opened from
    disk or anywhere else.
- **No `style=""` attribute anywhere**, SVG included, because a hash doesn't cover attributes.
  Geometry uses SVG presentation attributes (`x`, `y`, `width`, `d`, `transform`), and the look comes
  from classes.
- **The CSS** has no `url()`, `@import` or `@font-face`, and uses system font stacks.
- **Arrowheads** use an SVG `<marker>` referenced as `marker-end="url(#arrow)"`. That is a
  same-document fragment reference in an attribute, not a fetch, so `img-src 'none'` doesn't block
  it. Quickstart §1 checks that it draws.
- **Escaping**: every text and attribute value goes through `htmlText`, which escapes `& < > " '`.
- **Ticket links**: only for http or https addresses (FR-015), parsed with `new URL`, written
  escaped in `href`, with `rel="noopener noreferrer"` and `target="_blank"`. The address is also the
  link text, so it prints in full.
- **Also in `<head>`**: `<meta name="referrer" content="no-referrer">`, a `<title>`, and
  `<meta charset="utf-8">`.
- **Verification** (Playwright, quickstart §1):
  - open the downloaded file over `file://` with every route aborted;
  - listen for `securitypolicyviolation` (there must be none);
  - check that a `window.__ran` canary set by any injected script stays undefined;
  - check that every hostile string is shown literally and that no request was attempted.

**Alternatives considered**:

- `'unsafe-inline'` styles: would also allow injected `style` attributes.
- External CSS: not self-contained.
- A JavaScript-drawn diagram: the file must run no scripts.

## 11. The static diagram (SVG)

**Decision** (FR-006, FR-008, FR-020, FR-021):

- **Positions** come from core's `resolveLayout` and `absoluteRects` (#5), so they match the canvas.
- **The `viewBox`** is the bounding box of every rectangle plus a 40-unit margin, since coordinates
  can be negative.
- **Element shapes** follow Milestone 1's canvas:
  - external entity: rectangle;
  - process: rounded rectangle;
  - data store: open-sided rectangle, with lines at top and bottom;
  - trust boundary: dashed rectangle with its name at the top.

  Shape and dash pattern tell the types apart without colour.
- **Flows** are straight lines from the centre of the source to the centre of the target, cut where
  they meet each rectangle's border, with an arrowhead.
  - **Labels** sit beside their line, never on it, so a label wider than the line can't hide the
    arrow: above a flow that runs across, to the right of one that runs straight up or down. They
    have a thin white outline on the glyphs (`paint-order: stroke`) and **no box**: the backing
    rectangle first planned erased the text of other shapes it overlapped, which a PDF of a real model
    showed. A label that would overflow is cut with `…` and carries the full name in a `<title>`.
  - Two flows between the same pair of nodes (either direction) are offset sideways, 12 units apart
    and centred, **spread over no more than 48 units in all** (`FLOW_MAX_SPREAD` in `model.ts`), so
    every line still meets both shapes however many there are. Their labels go on the sides the
    flows were shifted towards, so neither covers the other's line. No self-loops exist
    (`elements_flow_not_self_loop`).
- **Long names**: SVG text doesn't wrap. A label that would overflow its shape is cut at a whole
  character, gets `…`, and carries the full name in a `<title>` child. The full name is always in the
  element's section, so nothing is cut off without saying so (the spec's "Very long text" edge case).
  The width estimate assumes a fixed 7.2 units per character at the 12-unit font, which is
  conservative for the system sans-serif.
- **Accessibility**: the `<svg>` has `role="img"` and `aria-labelledby` pointing at a caption: *"Data
  flow diagram. Every element and flow is listed under Elements below."* (FR-021).
- **Size**:
  - On screen, the SVG is at most 100% of the page width, and the figure can be scrolled sideways
    when it is wider.
  - In print, it is scaled to the page width (`max-width: 100%`, `height: auto`) and placed on its
    own page (FR-008).

**Alternatives considered**:

- `foreignObject` for wrapping text: inconsistent in print and in some PDF engines.
- Orthogonal edge routing like the canvas: the canvas uses React Flow's routing, which needs a DOM.
  A straight line is honest about source and target.

## 12. Repeated names and references

**Decision** (the spec's "Names that repeat" edge case):

- Every element section heading starts with its reference: `E3 · Process · API gateway`. A flow
  names its ends by reference and name: `from E1 Browser to E3 API gateway`.
- In the diagram and the flowchart, a label shows the name alone, unless another element in the
  threat model has exactly the same name. Then it shows `API gateway (E3)`.

**Rationale**: two elements with the same name can't be confused anywhere, and unique names stay
uncluttered in the picture.

## 13. File names and headers

**Decision**:

- **File name**: `<slug>-report-<YYYY-MM-DD>.md` or `.html`.
  - The slug is the threat model name, NFKD-normalized and lower-cased, with every run of characters
    outside `[a-z0-9]` turned into `-`. Leading and trailing `-` are trimmed, and the slug is cut at
    60 characters. It is `threat-model` when nothing is left.
  - The date is the export instant's UTC date (#7).
- **Header**: the router sets it with `res.attachment(filename)`, which encodes it. The raw name never
  goes into a header, so no header injection or encoding problem is possible.
- **Download name in the web app**: the app uses the same name, parsed from `Content-Disposition`.
  It falls back to building the same slug only if the header is missing.

**Rationale**: the file name contains no credential (FR-017), and it is stable and safe on every
file system.

## 14. Downloading in the web app

**Decision** (FR-001, the spec's "Unsaved diagram changes" edge case):

- A new `components/ExportReport.tsx` sits in the threat model page next to `GenerateThreats`,
  inside `DiagramEditorProvider`, so both tabs show it. It has two buttons: **Download Markdown
  report** and **Download HTML report**.
- **Clicking a button**:
  1. calls `apiFetch` (bearer token, renewal and retry as for every call);
  2. reads the body as a `Blob`;
  3. creates an object URL;
  4. clicks a temporary `<a download="…">`;
  5. revokes the URL.

  Nothing is stored or put in an address, and no credential goes anywhere but the `Authorization`
  header (FR-017).
- **While the diagram editor has unsaved changes** (`pendingCount > 0`, the same test `LeaveGuard`
  uses; a failed save stays pending, so it counts), a click first shows a `ConfirmDialog`: *"Some diagram changes aren't saved yet. The report
  shows what is saved. Download anyway?"*
- **While a download runs**, both buttons are disabled and a polite status says *"Preparing
  report…"*.
- **On an error**, the existing error banner text is shown, and nothing downloads. `404` reads "This
  threat model no longer exists."
- **The app's CSP**: a `blob:` download through an `<a download>` click is a navigation to a
  download, which CSP doesn't restrict. `connect-src 'self'` already covers the fetch. No change to
  `security-headers.ts`.

**Alternatives considered**:

- A plain link to the API URL: it would need the token in the URL (FR-017).
- `window.open`: blocked as a popup, and renders HTML at the app's origin.

## 15. Scale

**Decision** (FR-022, SC-004):

- Rendering is synchronous string building in arrays joined once per section. There is no
  streaming, worker or compression in this milestone: `plan.md` puts the worker in Phase 3, and
  compression isn't asked for.
- `report-large.spec.ts` seeds the bound (1,000 elements, about 15,000 threats, about 49,000
  mitigations). It downloads both formats and records:
  - the time from the click to the finished download, as the test sees it;
  - each file's size.

  Both formats must finish in under 15 seconds (SC-004). The page must stay responsive while a
  download runs: the test clicks another tab during it and checks that the tab answers.
- The size at the bound was measured at 12.8 MB for Markdown and 20.5 MB for HTML (quickstart §5), where the
  first estimate was 25 and 35 MB.
- **Accepted**: while a bound-sized report renders, the Node process is busy for that time, and other
  requests wait. A report of a typical model (50 elements, about 500 threats) renders in well under
  a second (SC-004's 2 seconds). Phase 3's worker is the place to move it if this matters in
  practice.

## 16. Dependencies

**Decision**: no runtime dependency. Three test-only devDependencies, each pinned by the lockfile and
subject to pnpm's `minimumReleaseAge` and Dependabot's cooldown, like every other:

| Package | Where | Why |
|---|---|---|
| `micromark` | `apps/api` devDependency | Renders the Markdown report in unit tests, to prove FR-014 / SC-005 against a real CommonMark parser (#8). |
| `micromark-extension-gfm` | `apps/api` devDependency | Adds GFM (tables, autolink literals, strikethrough), the dialect code hosting sites use (#8). |
| `mermaid` | `apps/web` devDependency | Renders the report's flowchart in Playwright, to prove FR-007 / SC-005, and supplies the size limits the FR-007a threshold is checked against, in the same browser suite (#9). |

**Rationale**: SC-005 can't be shown with string matching alone. Whether text stays literal is a
property of the renderer, so the tests use real renderers. None of them ships in the app image.

## 17. Governance

**Decision**:

- **Constitution 1.9.0 → 1.10.0 (MINOR)**, in the same change:
  - **Trust boundaries**: add `GET /api/v1/threat-models/{id}/report` to the notable `/api/v1`
    endpoints, next to the batch and generate endpoints.
  - **Information Disclosure, accepted risk** (Phase 2 Milestone 5): a report carries a whole threat
    model out of the app, by design, into files people share. Once downloaded, Specter can't protect
    or revoke them. They hold no credential or account name, and the response is `no-store`.
  - **Tampering / injection, mitigated**: user text is escaped for Markdown and Mermaid, and the HTML
    report is inert (meta CSP with no scripts and no outside loads, a hashed stylesheet, a `sandbox`
    response header).
  - **Denial of Service, accepted risk**: a bound-sized report occupies the API process for its render
    time. Any authenticated account can request one, as with any read. Revisit in Phase 3 (worker)
    or Phase 6 (rate limits).
- **`API.md`**: the new operation, its parameter, content types, headers and errors.
- **`apps/api/openapi.json`**: regenerated.
- **README**: no new environment variable, so no change.
- **`plan.md`**: no change.

## 18. What Milestone 4 left outstanding, settled here

- **Time zone**: UTC (#7).
- **Repeated names**: references (#12).
- **The risk summary's numbers**: `summarizeThreats` (core, Milestone 4) is called on the snapshot's
  threats, so the report and the threat list can't differ (FR-004, SC-002).
- **The "missing what its status needs" marker**: `lifecycleGap` (core, Milestone 4), with the
  threat's own mitigations from the snapshot.
