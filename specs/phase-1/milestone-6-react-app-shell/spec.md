# Feature Specification: React App Shell

**Feature Branch**: `feat/phase-1` (spec directory `006-react-app-shell`)

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "let's take milestone 6 of phase 1". This covers Phase 1 / Milestone 6
of `plan.md`, the React app shell. The app gets a browser UI again (M5 removed the static page):
login, a project list, and a threat model page with a threat table where threats and their
mitigations are created, edited and deleted. The app container serves the built UI, so a
deployment is still one app container plus its database. With this milestone, Phase 1's Definition
of Done can be met: `docker compose up` → log in → create a project and threat model → create, edit
and delete threats and mitigations in the UI.

## Clarifications

### Session 2026-10-04

- Q: Beyond threats and mitigations, how much project and threat model management should the UI
  offer? → A: Full CRUD. Projects can be created, listed, renamed, re-described and deleted in the
  UI. Threat models can be created, listed, renamed and deleted, and their status can be changed
  (FR-006 to FR-009). A threat model has no description: the record M3 defined has only a name, a
  methodology and a status, and this milestone changes no API (FR-024), so there is nothing to
  re-describe.
- Q: Where should the browser keep the login token? → A: The user wants a login that lasts until
  they log out, possibly using a refresh token, and wants it protected from XSS-style theft. So the
  long-lived credential is a server-side, revocable browser session. Page scripts can never read
  it. The short-lived access credential the UI uses for API calls is held in memory only and
  renewed silently while the session is valid (FR-002 to FR-005d).
- Q: Security headers are scheduled for Phase 6, but this milestone puts a browser UI in front of
  users. When should they land? → A: Now. A strict content security policy and basic hardening
  headers ship with the UI in this milestone. That item is pulled forward from Phase 6, and the
  constitution is amended to record it (FR-022, Assumptions).
- Q: Should this milestone stay as one piece, or should the browser-session work and the security
  headers be split into their own milestone, delivered before the UI? → A: Keep one milestone. The
  work is ordered so browser sessions and security headers land before the UI that depends on them
  (Assumptions).
- Q: How long should a browser session last, and should it also end after a period of no use? → A:
  A 30-day maximum lifetime from sign-in. The session also ends after 7 days with no use. The
  operator can change both limits (FR-002).
- Q: Should sign-in and session events be written to the server log, the way M5 logs every API
  write? → A: Yes. One stdout line per event: successful sign-in, failed sign-in, logout, a session
  ended by its limits or by a password change, and detected credential reuse. Each line carries ids
  only, never usernames from failed attempts, credentials or passwords (FR-005e).
- Q: How should a session be ended by someone other than the user who opened it, for example when a
  laptop is lost? → A: A "sign out everywhere" action in the UI ends every session of the signed-in
  account, the current one included. A password change still ends them too. There is no operator
  command (FR-005f).
- Q: Should sign-in get basic protection against password guessing now, or stay unprotected until
  Phase 6 as the constitution plans? → A: Now. Repeated failed sign-ins are throttled on both
  `/api/login` and browser sign-in, with operator-set limits. General rate limiting of all routes
  stays in Phase 6 (FR-005g).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log in and stay logged in, safely (Priority: P1)

A security engineer opens their Specter install in a browser, signs in with the account the
operator set up, and lands on their projects. They close the tab, come back the next day, and are
still signed in. They don't have to log in again until they log out, the session reaches its
limits (30 days from sign-in, or 7 days unused), or they use "sign out everywhere". When they log
out, that browser session ends for good:
replaying anything the browser held does not get back in. Throughout, no credential that outlives
a few minutes is ever readable by scripts running in the page.

**Why this priority**: Nothing else in the UI is reachable without it, and it is the first step of
Phase 1's Definition of Done. The user asked for a login that persists until logout without being
exposed to XSS-style theft. Getting that right is a security property, not polish.

**Independent Test**: In a real browser against a running install, log in, reload, open a new tab,
and restart the browser, and confirm the user stays signed in each time. Confirm that page scripts
can read no long-lived credential. Log out, then confirm that the UI returns to the login page and
that every credential the browser held is now rejected by the server. Repeat with wrong credentials
and with an expired session.

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** the user signs in, **Then** they land on the project list,
   or on the page they originally asked for if they arrived through a deep link.
2. **Given** wrong credentials, **When** the user signs in, **Then** they see one generic "invalid
   username or password" message. It never says which part was wrong, and the form keeps the
   username but clears the password.
3. **Given** a signed-in user, **When** they reload, open a second tab, or close and reopen the
   browser, **Then** they are still signed in, with no login prompt.
4. **Given** a signed-in user, **When** they log out, **Then** they are back on the login page, the
   session ends on the server, and any credential the browser held before logout is rejected if
   replayed.
5. **Given** a session that has expired, been ended by "sign out everywhere" or a password change,
   or ended in another tab, **When** the user takes their next action, **Then** they are taken to the login page with a short
   "your session has ended" message. Nothing they were doing is silently lost without that message.
7. **Given** a user signed in on two devices who has lost one of them, **When** they choose "sign
   out everywhere" on the other, **Then** every session of their account ends at once, the lost
   device's session included, and they are taken to the sign-in page.
6. **Given** a signed-in user, **When** any script running in the page tries to read stored
   credentials, **Then** it finds nothing that is valid for longer than the short access lifetime.

---

### User Story 2 - Work on threats and mitigations in a threat model (Priority: P1)

The engineer opens a threat model and sees its threats in a table: title, STRIDE category,
likelihood, impact, derived risk, status, and the element each one belongs to, if any. They add a
threat, change its likelihood and see the risk update, edit its description, and set its status.
For each threat they add mitigations, edit them, set their status, and link a ticket URL. They
delete a mitigation and then a threat, each after confirming.

**Why this priority**: This is the core of the milestone and the heart of Phase 1's Definition of
Done ("create, edit and delete threats and mitigations in the UI").

**Independent Test**: With a signed-in session and an existing threat model, create a threat,
edit every editable field, add two mitigations, edit one, and delete one. Then delete the threat.
After each step, reload the page and confirm the table shows exactly what the API reports.

**Acceptance Scenarios**:

1. **Given** a threat model, **When** the user opens it, **Then** they see its name, status and
   project, a table of all its threats with their mitigations, and an empty state that invites them
   to add the first threat if there are none.
2. **Given** the threat model page, **When** the user adds a threat with a title, category,
   likelihood and impact (description and status optional), **Then** it appears in the table with
   status "open" unless they chose another, origin "manual", and the risk the server derived.
3. **Given** a threat, **When** the user edits any of its title, description, category, likelihood,
   impact or status and saves, **Then** only those fields change and the risk shown matches the
   server's derived value. Risk and origin are shown but can never be edited.
4. **Given** a threat linked to a diagram element (created through the API), **When** it is shown,
   **Then** the element's name appears with it. Editing the threat in the UI keeps that link.
5. **Given** a threat, **When** the user adds a mitigation with a description (status and ticket URL
   optional), edits it, or changes its status, **Then** the change is saved and shown with that
   threat.
6. **Given** a threat that has mitigations, **When** the user asks to delete it, **Then** a
   confirmation names the threat and says its mitigations will be deleted with it. Only on confirm
   is it deleted. Cancelling changes nothing.
7. **Given** any form, **When** the user submits something the server rejects (an over-long title,
   an invalid URL), **Then** the message appears next to the failing field, what they typed stays in
   the form, and nothing is saved.

---

### User Story 3 - Manage projects and threat models (Priority: P1)

The engineer sees every project in a list, creates "Payments platform", opens it, and creates a
threat model "Checkout v2". Later they rename the project, update its description, move the threat
model's status from draft to in review, and eventually delete an obsolete threat model. Each delete
asks first and says what goes with it.

**Why this priority**: Phase 1's Definition of Done needs project and threat model creation in the
UI. The user asked for full management (Clarifications) so nothing in day-to-day use requires
dropping to the API.

**Independent Test**: From an empty install, create a project and a threat model in it, rename both,
change the model's status through every allowed value, then delete the model and the project after
confirming each. Confirm each change survives a reload and matches the API.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open the project list, **Then** they see every project
   with its name, description and creation date, oldest first (the API's order), or an empty state
   that invites them to create the first one.
2. **Given** the project list, **When** the user creates a project with a name and an optional
   description, **Then** it appears in the list. **Given** a project with the same name (ignoring
   case and surrounding spaces) already exists, **Then** they see "a project with this name already
   exists" next to the name field and nothing is created.
3. **Given** a project, **When** the user opens it, **Then** they see its threat models with name,
   methodology and status, and can create one. Methodology is STRIDE, and status starts as draft.
4. **Given** a project or threat model, **When** the user renames it, changes its description, or
   (for a threat model) sets its status to any allowed value, **Then** the change is saved and shown.
   Any status can be set at any time, as in M5 FR-010a.
5. **Given** a project or threat model, **When** the user asks to delete it, **Then** a confirmation
   names it and says everything inside it will be permanently deleted (for a project: its threat
   models and all their content). Only on confirm is it deleted, and the user is returned to the
   list that contained it.

---

### User Story 4 - One container serves the API and the UI (Priority: P2)

The operator upgrades their install. Still running one app container and its database, they open
the app's address in a browser and get the UI. Scripts that call the API with a bearer token, and
the `/health` check, behave exactly as before. Unknown API paths still answer with the JSON error,
never with a web page.

**Why this priority**: `plan.md` requires deployment to stay a single app container plus
Postgres. It ranks below Stories 1–3 because those deliver the user value, but the milestone isn't
done without it.

**Independent Test**: Build the release image, start it with `docker compose up`, and walk through
the Definition of Done in a browser. Confirm that `/health`, the existing login and users
endpoints, and every v1 endpoint pass their existing automated tests, and that unknown `/api/…`
paths still answer `404 { error: "Not found" }`.

**Acceptance Scenarios**:

1. **Given** a fresh `docker compose up`, **When** the operator opens the app's root address,
   **Then** the login page appears. No second container or service is needed.
2. **Given** a signed-in user, **When** they open a bookmarked or shared link to a project or a
   threat model, or reload on one, **Then** that page appears directly.
3. **Given** any request under `/api/` that the API doesn't serve, including the removed
   `/api/threats`, **When** it is made with or without credentials, **Then** it still gets
   `404 { error: "Not found" }` as JSON, never the UI's page.
4. **Given** the upgraded install, **When** `/health`, `/api/login`, `/api/users` and `/api/v1` are
   exercised by their existing automated tests, **Then** those tests pass. Among the app's existing
   API tests, the only ones that change are those asserting that `/` and browser paths answer 404
   (the same scope as SC-007).

---

### Edge Cases

- **Two tabs, one session.** Both tabs share the same browser session. Renewing the access
  credential in one tab never logs the other out. Logging out in one tab ends the session for both:
  the other tab goes to the login page on its next action.
- **Session ends mid-edit.** The user gets the "session has ended" message and the login page. What
  they had typed in an open form is not saved, and the message says so. No draft is kept in browser
  storage, because draft text is threat data.
- **Record changed or deleted elsewhere.** The last write wins, as in M5. If the record the user is
  viewing or editing was deleted by someone else, they see "this item no longer exists", and the list
  refreshes from the server.
- **Deleting an element-linked threat, or a project with many threat models.** The delete follows
  M3's rules: deleting a project or threat model removes everything inside it, and deleting a threat
  removes its mitigations. The confirmation states these consequences before the user commits.
- **Large threat models.** A threat model of 1,000 threats and 2,000 mitigations (M5 SC-007's
  dataset) must stay usable (SC-004). There is no pagination, filtering or search in this milestone.
- **Text that looks like markup.** Titles, descriptions and names containing HTML or script are shown
  literally as text, never interpreted. A mitigation's ticket URL is a clickable link only if it is
  http(s). M3 already rejects every other scheme, and the UI doesn't rely on that alone.
- **Unknown in-app page.** A link to a page that doesn't exist, or to a project or threat model that
  doesn't exist or was deleted, shows a "not found" page inside the UI with a way back to the
  project list.
- **Missing static file.** A request for a UI file that doesn't exist answers 404 rather than the
  UI's page, so a broken deployment fails visibly.
- **Non-GET requests outside `/api/`.** They keep answering `404 { error: "Not found" }`.
- **Operator changes an account's password.** Today that happens only through admin reseeding. Every
  browser session of that account ends, and the user has to sign in with the new password.
- **Restart or redeploy with the same admin password.** Seeding runs on every start and re-hashes the
  password even when it hasn't changed. No session may end because of that (FR-005c). Upgrades and
  scale-outs must not log anyone out.
- **Someone guesses at the admin's password from one address.** Only that address is slowed down for
  that account. The real admin, signing in from elsewhere, is not locked out. An attacker spread
  over many addresses is slowed per address but not stopped. Account lockout is deliberately not
  used, so an attacker can't lock the admin out. This residual risk is recorded in the Threat Model.
- **Many users behind one shared address** (an office proxy). The per-address limit is high enough,
  and configurable, so normal use from one office isn't refused.
- **API scripts.** Scripts keep using `POST /api/login` and its bearer token unchanged. That token's
  lifetime and behavior are unaffected by browser sessions.
- **Plain-HTTP local quickstart.** The `docker compose up` quickstart on `localhost` over plain HTTP
  must still let the user sign in and stay signed in. Production deployments run behind HTTPS.
- **Browser without scripts.** The UI requires JavaScript. Without it, the page shows a short message
  saying so.

## Requirements *(mandatory)*

### Functional Requirements

**Sign-in and sessions**

- **FR-001**: The UI MUST offer a sign-in page with username and password. A failed sign-in MUST show
  one generic message that never reveals whether the username exists. The server MUST keep
  enforcing the existing timing defense against username enumeration (constitution Principle I).
- **FR-002**: A successful sign-in MUST start a browser session. The session lasts until the first
  of these happens:
  - the user logs out;
  - the user signs out everywhere (FR-005f), or the account's password changes (FR-005c);
  - 30 days pass since sign-in (maximum lifetime);
  - 7 days pass with no renewal (idle limit).

  The operator can change both limits, and the idle limit can never exceed the maximum lifetime.
  Renewal does not extend the maximum lifetime. Before the session ends, the UI MUST NOT ask for
  credentials again, across reloads, new tabs and browser restarts.
- **FR-003**: The long-lived session credential MUST be unreadable by any script running in the page.
  It MUST be sent by the browser only to the server's own session endpoints, never to other sites,
  and it MUST NOT be usable to trigger a session action from another site.
- **FR-004**: The credential the UI uses to call the API MUST be short-lived (minutes, not hours), MUST
  be held only in page memory (never written to browser storage, URLs or logs), and MUST be renewed
  silently from the session while it is valid.
- **FR-005**: Sessions MUST be recorded on the server so they can be ended. Logging out MUST end the
  session on the server immediately. After logout, neither the session credential nor the last access
  credential the browser held may be accepted again. The access credential is accepted only until its
  short lifetime ends, and only if its session is still active.
- **FR-005a**: A session credential MUST be single-use for renewal: each renewal replaces it. If an
  already-replaced credential is presented again, the server MUST treat that as possible theft and
  end the whole session. Concurrent renewals from the same browser's tabs MUST NOT trigger this.
- **FR-005b**: The server MUST store only a non-reversible form of each session credential, never the
  credential itself, and MUST NOT log it.
- **FR-005c**: Changing an account's password MUST end all of that account's browser sessions. A
  password change means the password itself is different, not just a new hash. Today the only path
  that changes a password is admin seeding, which runs on every start and re-hashes even an unchanged
  password. A restart, a redeploy or a new app instance with the same admin password MUST NOT end any
  session.
- **FR-005d**: The existing `POST /api/login` bearer-token flow used by API clients MUST keep its
  current behavior, except for the sign-in throttling in FR-005g, and its existing contract tests
  MUST pass unmodified. Every `/api/v1` endpoint
  MUST accept both the existing bearer token and the UI's access credential. `/api/users` MUST keep
  accepting only the `/api/login` bearer token, never the UI's access credential: the UI never calls
  it, and a script injected into the page must not be able to create an account it can use later
  (Principle V, least privilege). Every endpoint keeps rejecting everything else with the same 401
  responses as today.
- **FR-005e**: Each of these session events MUST write exactly one line to the server log (stdout):
  - a successful sign-in;
  - a failed sign-in;
  - a logout, and a "sign out everywhere" (one line, with the number of sessions ended);
  - a session ended by its maximum lifetime, its idle limit or a password change;
  - detected reuse of a replaced session credential;
  - a sign-in refused by throttling (FR-005g). These lines apply to `/api/login` as well as browser
    sign-in, along with its successful and failed sign-in lines.

  Each line names the event and, where known, the account id and the session's internal id. The
  internal id is not the session credential and can't be used as one. A line MUST NOT contain a
  username (in particular the one typed into a failed sign-in), a password, a credential, or the
  request body. Like M5's write log, this is an operator trace, not Phase 6's persisted audit log.
  Expiry may be logged when the server first notices it, not at the exact moment it happens, but
  every ended session MUST be logged before its record is deleted.
- **FR-005f**: The UI MUST offer a "sign out everywhere" action, after a confirmation that says every
  device will be signed out. It MUST end every active session of the signed-in account on the
  server immediately, the current one included. Every credential those sessions issued is then
  rejected, as for a logout (FR-005). It affects only that account's sessions. It does not revoke
  bearer tokens issued by `POST /api/login`, which have their own lifetime.
- **FR-005g**: Failed sign-ins MUST be throttled on both `POST /api/login` and browser sign-in, which
  share the same limits:
  - After repeated failures for one username from one network address, further attempts for that
    username from that address are refused for a wait that grows with each further failure, up to
    a cap.
  - After many failures from one network address, across any usernames, further attempts from that
    address are refused the same way.
  - A refused attempt answers 429 `{ error: "Too many sign-in attempts. Try again later." }`. It
    does not check the password, so a correct password is refused too while the wait lasts.
  - Throttling MUST behave the same whether or not the username exists, so it never reveals which
    accounts exist.
  - An IPv6 address MUST count as its /64, because one host controls a whole /64 and could otherwise
    rotate source addresses for a fresh set of guesses each time.
  - A successful sign-in clears the failures counted for that username from that address.
  - The operator can set the thresholds, the waits and the cap. Defaults are generous enough that a
    user who mistypes a few times is never refused, and so that `/api/login`'s existing contract
    tests pass unchanged.
  - The network address MUST be the real client's address when the app runs behind the configured
    proxy or load balancer. A client can't choose its own address by sending a header.
  - The counts MUST be shared by every app instance, so throttling holds when the app is scaled
    out (Principle IV).

  General rate limiting of every route stays in Phase 6.

**Projects and threat models**

- **FR-006**: The UI MUST list all projects, in the API's order, and let the user create, rename,
  re-describe and delete a project.
- **FR-007**: The UI MUST list a project's threat models and let the user create, rename, delete, and
  set the status of a threat model to any allowed value. Methodology is shown but not editable,
  because STRIDE is its only allowed value. A threat model has no description to edit.
- **FR-008**: Every delete in the UI, of a project, threat model, threat or mitigation, MUST ask for
  confirmation first. The confirmation MUST name the record and state what is deleted with it,
  following M3's delete rules. Nothing is deleted on cancel.
- **FR-009**: Every list MUST show an empty state that invites the user to create the first item.

**Threats and mitigations**

- **FR-010**: The threat model page MUST show all of the model's threats in a table with title,
  category, likelihood, impact, risk, status and linked element name (if any). Each threat's
  mitigations MUST be reachable from its row without leaving the page.
- **FR-011**: The UI MUST let the user create a threat by entering title, category, likelihood and
  impact, with description and status optional. Threats created in the UI are always model-level (no
  element) and always origin "manual". The UI never offers another origin.
- **FR-012**: The UI MUST let the user edit a threat's title, description, category, likelihood,
  impact and status. Risk and origin MUST be shown read-only. Risk always shows the server's derived
  value after a save. Editing a threat MUST NOT change its element link.
- **FR-013**: The UI MUST let the user create, edit and delete mitigations on a threat, with a
  description, a status, and an optional ticket URL shown as a link that opens in a new tab without
  giving that tab access to Specter's page.
- **FR-014**: Any allowed status value MUST be selectable at any time for threats and mitigations, as
  in M5 FR-010a.

**Behavior and feedback**

- **FR-015**: Every form MUST check required fields, allowed values and length limits before
  submitting, using the same shared limits as the API. Whatever the server rejects MUST still be shown
  next to the relevant field, or at the top of the form if no field applies. The user's input MUST be
  preserved after a rejection.
- **FR-016**: Every change MUST be shown only after the server confirms it. On failure, the screen
  MUST show the server's state, not the attempted change, with an error message.
- **FR-017**: All user-supplied text MUST be rendered as text, never as markup. Only http(s) URLs MAY
  be rendered as links.
- **FR-018**: When the session ends (logout in another tab, expiry, sign out everywhere, password
  change), the UI MUST take the user to the sign-in page with a message. After sign-in, it returns them
  to the page they were on.
- **FR-019**: Each project and threat model MUST have its own address, so it can be bookmarked,
  shared and reloaded. Unknown addresses or missing records MUST show an in-app "not found" page.
- **FR-020**: The UI MUST be fully usable with the keyboard alone. Every form control MUST have a
  visible label, and errors MUST be announced to assistive technology.

**Serving and security**

- **FR-021**: The app container MUST serve the built UI alongside the API, so a deployment is still one
  app container plus its database. Serving rules:
  - A GET for a page address outside `/api/` and `/health` gets the UI.
  - A GET for a UI file that doesn't exist answers 404.
  - Any unknown path under `/api/` (any method) keeps answering 404.
  - Non-GET requests outside `/api/` keep answering 404.
  - Every 404 above stays `{ error: "Not found" }` as JSON, as M5 FR-012 requires.
  - `/health` keeps returning 200 with no auth and no database dependency.

  The rule that tells a page address from a file request is a planning decision. It MUST be
  deterministic and documented, and it MUST settle each path in the existing not-found contract test:
  `/`, `/index.html`, `/app.js`, `/style.css`, `/nope`. This supersedes M5 FR-012 and FR-018 only
  where they required `/` and browser page addresses to answer 404.
- **FR-022**: Every response that serves the UI MUST carry a strict content security policy:
  - Scripts and styles load only from the app's own origin. No inline scripts and no evaluated code.
  - The page connects only to its own origin.
  - The page cannot be framed.
  - Forms submit only to the app's own origin.

  Every response from the app MUST also carry basic hardening headers that stop MIME sniffing, stop
  framing, and limit the referrer sent to other sites. The UI MUST work with this policy in place,
  with no exceptions added to make it work.
- **FR-023**: The UI MUST NOT load anything from another origin at runtime: no external fonts,
  scripts, analytics or telemetry (plan.md's "private by default").
- **FR-024**: No new API capability is needed for projects, threat models, threats or mitigations: the
  UI uses the existing v1 endpoints. The session endpoints added for FR-002 to FR-005f are new entry
  points. Sign-in and renewal must work without a bearer token, and every `/api/v1` route requires
  one (M5 FR-004). So the session endpoints MUST live outside `/api/v1`, next to `/api/login`. They
  MUST be documented in `API.md`, use the `{ error }` shape, and be covered by tests like every other
  endpoint. The OpenAPI document keeps covering v1 only.

**Verification and documentation**

- **FR-025**: An automated test MUST drive a real browser through Phase 1's Definition of Done against
  the running app and a real database: sign in, create a project and a threat model, create, edit and
  delete a threat and a mitigation, and log out. A second scenario MUST cover the session staying
  valid across a reload and a new browser context, and ending on logout. CI MUST run these tests.
- **FR-026**: Automated tests MUST cover:
  - each session rule in FR-002 to FR-005f: maximum lifetime, idle limit, logout, credential reuse,
    password change, sign out everywhere, and the session credential's cookie-level protections;
  - the session log lines in FR-005e: present for each event with the right fields, and with no
    username, password or credential in them;
  - sign-in throttling in FR-005g, on both sign-in paths: the per-username-and-address and
    per-address limits, the growing wait, a correct password refused during the wait, the same
    behavior for unknown usernames, and that a spoofed forwarding header doesn't change the counted
    address;
  - the serving rules in FR-021;
  - the presence of the headers in FR-022;
  - text-only rendering (FR-017) with a markup payload;
  - the UI's handling of a rejected save and of an ended session.
- **FR-027**: The new UI workspace MUST be covered by CI's required typecheck, lint, test and Docker
  build checks. The release image MUST contain the built UI.
- **FR-028**: Any new environment variable (for example, the session's maximum lifetime and idle
  limit, and the sign-in throttling limits) MUST be added to the README's environment variable table
  with its default. `README.md` MUST describe how to open
  the UI after `docker compose up` and how to run it during development.
- **FR-029**: In the same change, the root `plan.md` MUST be updated to match this milestone, in these
  places. It is **not** committed: the maintainer keeps it out of version control (decision of
  2026-10-05, overriding M5 FR-019), and `.gitignore` says so.
  - Phase 1 Milestone 6's text, to include server-side browser sessions, sign-in throttling and
    security headers;
  - Phase 6's security-headers and rate-limiting items. This milestone brings the headers forward,
    and the throttling of failed sign-ins;
  - the tech stack's Tests row, once planning chooses the browser test tool.

### Key Entities *(include if feature involves data)*

- **Browser session** (new): one signed-in browser. It records which account it belongs to, when it
  started, when it was last renewed, when it expires, and whether it has ended. The current session
  credential is stored only in a non-reversible form. An account can have many sessions, which end
  together when its password changes.
- **Sign-in failure count** (new): recent failed sign-ins, counted per username-and-address pair and
  per address, with when the current wait ends. It is shared by every app instance and kept only
  as long as the wait and its counting window need. It never holds a password.
- **Naming in the plan.** The design documents call the session credential the *session cookie*
  (`specter_session`, also "refresh cookie"), and the access credential the *UI access token* (a JWT
  with audience `specter-ui`). They are the same things.
- **Access credential** (new, not stored): a short-lived proof of a valid session, used by the UI to
  call the API. It is held in page memory only.
- **Account** (existing): owns sessions. It is unchanged, and not managed in the UI.
- **Project, threat model, element, threat, mitigation** (from M3, unchanged): shown and edited
  through the existing v1 API. Elements are shown by name only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting from a fresh `docker compose up`, a first-time user completes Phase 1's
  Definition of Done in the browser in under 5 minutes, without using the API directly or reading
  documentation beyond the README's quickstart.
- **SC-002**: A signed-in user stays signed in for 100% of reloads, new tabs and browser restarts
  within the session lifetime. After logout, 100% of credentials the browser held are rejected by the
  server on replay.
- **SC-003**: Page scripts can read 0 credentials that remain valid for more than the short access
  lifetime. Every UI response carries the content security policy and hardening headers, and the
  browser reports 0 policy violations during the Definition of Done walkthrough.
- **SC-004**: On the reference deployment, a threat model with 1,000 threats and 2,000 mitigations
  is fully shown and responsive to input within 3 seconds of opening it.
- **SC-005**: A title, name or description containing markup or a script payload is shown literally in
  100% of places it appears, and executes nothing.
- **SC-006**: Every save the server rejects shows a message to the user, and the user's input is
  preserved in 100% of cases. A rejected save is never shown as successful.
- **SC-007**: All existing automated tests for `/health`, `/api/login`, `/api/users` and `/api/v1`
  pass. The only changed tests are those that asserted `/` and browser paths answer 404. CI's required
  checks stay green.
- **SC-008**: The UI makes 0 requests to any origin other than the app's own.

## Assumptions

- **Out of scope for this milestone**, per `plan.md` and constitution Principle III:
  - elements and diagrams. Elements are shown by name on threats, but are not created, edited or
    picked in the UI (Phase 2 Milestone 1);
  - user and account management in the UI. Accounts stay API- and operator-managed;
  - roles, sharing or per-project permissions (Phase 6). Any signed-in account can see and change
    everything, as with the API;
  - pagination, filtering, sorting controls and search;
  - status transition rules (Phase 2 Milestone 4);
  - rule-generated threats, reports, import/export, and AI features (Phases 2 and 3);
  - general rate limiting of every route (Phase 6). Only failed sign-ins are throttled here
    (FR-005g);
  - offline use, saved drafts, and mobile-specific layouts. The UI should still be readable on a
    narrow screen.
- **Session limits.** The user asked for a session that lasts until logout. It still needs limits, so
  a stolen or forgotten session eventually stops working: 30 days from sign-in, or 7 days without
  use, both configurable (FR-002, Clarifications). The access credential's lifetime is a few minutes,
  decided in planning.
- **Login endpoint for scripts.** `POST /api/login` and its bearer token stay as they are for API
  clients (FR-005d). Browser sign-in uses its own session endpoints. A planning decision may reuse
  the same credential check, but must not change the existing endpoint's contract.
- **Server-side session records** are a new table, added by a forward-only migration. Requests are
  still stateless at the app level: any app instance can verify a session against the database, so
  horizontal scaling (Principle IV) is preserved.
- **Cookies return.** The session credential is the app's first cookie. The constitution's current
  "no CSRF exposure because auth is bearer-only" mitigation must be restated in this change:
  - The API itself still authorizes only by a credential sent explicitly by the client, never by a
    cookie, so the v1 API stays immune to CSRF.
  - The cookie reaches only the session endpoints. It is restricted so other sites cannot send it,
    and those endpoints also verify the request's origin.
- **Constitution amendment (Principles III and V).** This milestone adds a browser UI, new session
  entry points, a new stored asset (session records), a cookie, and security headers. The Threat
  Model section must be updated in the same change:
  - **Assets**: browser session records and session credentials.
  - **Trust boundaries**: browser → app UI. The "no browser UI until M6" text is replaced.
  - **Spoofing**: session theft and replay, mitigated by script-unreadable credentials, rotation and
    reuse detection. Sign-in brute force moves from "open risk" to mitigated by throttling
    (FR-005g). Guessing spread across many addresses remains a residual risk.
  - **Tampering**: the CSRF note, restated per above.
  - **Repudiation**: sign-in, logout and session events now leave an operator trace (FR-005e). It is
    still not persisted, so the open risk stays until Phase 6.
  - **Information Disclosure**: XSS as a path to act as the user. It is mitigated by text-only
    rendering and the CSP, and it can no longer exfiltrate a long-lived credential. Security headers
    move from "open risk" to mitigated for the UI.
  - **Elevation of Privilege**: unchanged scope. It is still any account, all data. The UI's access
    credential is limited to `/api/v1`, so an injected script can't create accounts through
    `/api/users` (FR-005d).
  - **Denial of Service**: sign-in throttling is per address, not per account, so it can't be used
    to lock a user out. General rate limiting stays an open risk until Phase 6.

  Pulling security headers and sign-in throttling forward from Phase 6 is a deliberate exception to Principle III's "no
  later-phase work", made at the user's direction (Clarifications), and must be justified in the PR
  description. Expected to be a MINOR bump, 1.5.0 → 1.6.0, following earlier milestones' precedent.
- **Browser test tool.** `plan.md` lists browser tests for key UI flows from Phase 2, while
  constitution Principle II reads as requiring them from Phase 1. This spec requires an automated
  real-browser test of the Definition of Done flow now (FR-025). The tool is a planning decision, and
  `plan.md`'s tech-stack row should be aligned with whatever is chosen.
- **One milestone, ordered work.** Browser sessions, security headers and the UI ship as one
  milestone. The UI can't sign in without sessions, so splitting it would deliver nothing usable
  sooner. Planning orders the work as sessions, then headers and serving, then the UI.
- **Supported browsers.** Current versions of the major evergreen browsers. No legacy browser support.
- **Design.** A clean, functional interface is enough. Visual design polish and theming are not goals
  of this milestone. A dark mode is not required.
