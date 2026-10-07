# Contract: Web UI

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) #15

This is the observable behavior of the browser UI. The Testing Library tests and the Playwright specs
assert against these roles, labels and messages. Wording may be polished during implementation, but
it must keep each message's meaning, and the tests must be updated in the same change.

## Routes

| Path | Page | Session required |
|---|---|---|
| `/login` | Sign in | no. A signed-in user is sent to `/projects`. |
| `/` | redirects to `/projects` | yes |
| `/projects` | Project list | yes |
| `/projects/:projectId` | Project: details plus its threat models | yes |
| `/threat-models/:threatModelId` | Threat model: details plus the threat table | yes |
| anything else, or an id that is malformed or doesn't exist | Not found: "This page doesn't exist." with a link to the project list | yes |

**Signed-out access**: opening a protected route while signed out first tries a silent renewal. If
that fails, the user goes to `/login` and returns to the original path after signing in.

## Shell (every signed-in page)

- A header with the product name (a link to `/projects`) and the signed-in username.
- A **Log out** button, and a **Sign out everywhere** button with a confirmation: "Sign out on every
  device? You'll need to sign in again everywhere."
- A breadcrumb on project and threat model pages.

## Sign in

- Fields: **Username** and **Password** (`type=password`, `autocomplete=current-password`), and a
  **Sign in** button.
- 401 → "Invalid username or password." The username is kept and the password cleared.
- 429 → "Too many sign-in attempts. Try again later."
- A session ending elsewhere → this page shows "Your session has ended. Anything you hadn't saved was
  not kept."
- A page with scripts disabled shows: "Specter needs JavaScript to run."

## Project list (`/projects`)

- Each project shows its **name** (a link), its **description**, and its **created** date (local
  date). The order is the API's.
- Empty state: "No projects yet." with a **New project** button.
- **New project** form: **Name** (required, at most 200 characters) and **Description** (optional,
  at most 10,000).
- A duplicate name shows "A project with this name already exists." on the Name field.

## Project page (`/projects/:projectId`)

- Shows the name and description, with **Edit** (rename or re-describe) and **Delete**.
- Delete confirmation: "Delete project "<name>"? This permanently deletes its threat models and
  everything in them." After deleting, the user returns to `/projects`.
- A threat models table with **Name** (a link), **Methodology** and **Status**.
- Empty state: "No threat models yet."
- **New threat model** form: **Name** only. Status starts as draft, and is changed on the threat
  model page. A threat model has no description.
- Duplicate name in the project → "A threat model with this name already exists in this project."

## Threat model page (`/threat-models/:threatModelId`)

**Header**:

- Shows the name, project (a link) and methodology (read-only).
- **Status** is a select with draft / in review / approved. It saves on change, and any value can
  be chosen at any time.
- **Edit** (rename) and **Delete**.
- Delete confirmation: "Delete threat model "<name>"? This permanently deletes its elements, threats
  and mitigations." After deleting, the user returns to the project page.

**Threat table**: a `<table>` with these columns:

1. **Title**
2. **Category**
3. **Likelihood**
4. **Impact**
5. **Risk**: read-only, the server's value
6. **Status**
7. **Element**: the element name, or "—" for a model-level threat
8. **Mitigations**: the count, plus a toggle button with `aria-expanded`
9. **Actions**: Edit and Delete

**Threat form**, used for both add and edit:

- **Title**: required, at most 200 characters.
- **Category**: a select of the six STRIDE categories.
- **Likelihood** and **Impact**: Low, Medium or High.
- **Status**: open, mitigated, accepted or not applicable. Defaults to open.
- **Description**: optional, at most 10,000 characters.
- Origin is shown as "manual" and can never be edited.

**Threat deletion**: the confirmation reads "Delete threat "<title>"? Its <n> mitigation(s) will be
deleted too." When the threat has no mitigations, it reads "Delete threat "<title>"?".

**Mitigations**, shown in the expanded row:

- A list with **Description**, **Status** (proposed / implemented / verified) and **Ticket**. The
  ticket is a link only for http(s) URLs, and opens in a new tab with
  `rel="noopener noreferrer"`.
- **Add mitigation**, **Edit** and **Delete**, with the confirmation "Delete this mitigation?".
- Mitigation form:
  - **Description**: required, at most 10,000 characters.
  - **Status**: defaults to proposed.
  - **Ticket URL**: optional, http(s) only, at most 2,048 characters.

**Empty state**: "No threats yet." with **Add threat**.

## Behavior rules (all pages)

- **Saves are not optimistic.** Nothing shows as saved until the server confirms (FR-016). While a
  save is in flight, its button is disabled and reads "Saving…".
- **Rejections stay in the form.** A rejection keeps the form open with its input, shows field
  messages through `aria-describedby` and `aria-invalid`, and puts a summary in `role="alert"`.
- **A 404 on a write** shows "This item no longer exists." and refreshes the affected list.
- **Loading and failure states**: loading shows "Loading…". A failed load shows the server's message
  and a **Retry** button.
- **Text only.** All record text is rendered as text, never as HTML.
- **No background activity.** The UI never polls or renews on a timer, and doesn't refetch on window
  focus or reconnect. Only user actions cause requests, so an idle tab doesn't keep its session
  alive past the idle limit.
- **Keyboard.** Every action is reachable by keyboard. Dialogs trap focus, close on Escape, and
  return focus to the control that opened them.
