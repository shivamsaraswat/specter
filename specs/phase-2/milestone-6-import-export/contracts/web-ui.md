# Contract: Web UI

## `ExportModel` (threat model page, both views)

- **Where**: a group labelled "Export", next to the report group (`ExportReport`).
- **Buttons**:
  - "Download Specter file" → `GET …/export?format=specter`;
  - "Download OTM file" → `GET …/export?format=otm`.
- **Behaviour**: the same as `ExportReport`:
  - fetch with the bearer token, and save the body as a `Blob` under the server's file name;
  - announce in a `role="status"` line;
  - show failures in the `ErrorSummary`;
  - with diagram changes unsaved, ask first: "Some diagram changes aren't saved yet. The export holds
    only what is saved."
- **Shared code**: the download code moves from `ExportReport` to `api/download.ts`.

## `ImportThreatModel` (project page)

- **Where**: an "Import threat model" button next to "New threat model". It opens an import panel in
  place, not a modal, so the preview's long list scrolls with the page.

### Steps

1. **Choose a file**: one file input, labelled "File to import", accepting `.json` and
   `application/json`.
   - **Over 64 MiB**: *"This file is larger than 64 MiB, the most Specter can import."* Build the
     figure from `IMPORT_MAX_BYTES`. Nothing is sent.
   - **Not JSON**: *"This file isn't JSON. Specter imports Specter files (version 1), OTM 0.2.0 files
     in JSON, and Threat Dragon version 2 files."*
   - **A Threat Dragon version 1 file**: *"This is a Threat Dragon version 1 file. Open and save it in Threat Dragon
     2, which converts it, then import it here."*
   - **Not recognised** by `detectFormat`: *"This file
     isn't in a format Specter reads. Specter imports Specter files (version 1), …"* (the same list).
2. **Checking**: the status line says *"Checking ‹format label›…"*, where the label is "Specter
   file", "OTM file" or "Threat Dragon file". The file input is disabled.
3. **Preview**:
   - **A heading**, *"Ready to import"*, and the recognised format.
   - **For each model**: a name field, prefilled and labelled "Name of threat model ‹n›", the status
     it will have, and the counts of elements, threats and mitigations.
   - **A name issue** shows as that field's error, through `FormField`:
     - `taken`: *"A threat model with this name already exists in this project."*
     - `duplicate`: *"Another threat model in this file has the same name."*
     - `empty`: *"Enter a name."*
     - `too_long`: *"Use at most 200 characters."*

     **Editing a name never sends the file again.** The issue is worked out in the browser with
     core's `nameIssues(names, existingNames)`. `existingNames` comes from the project page's threat
     model list (`useThreatModels`), which is complete because it isn't paged. "Import" stays
     disabled while any name has an issue. The server checks again on Import and may still answer
     409 if a name was taken in between.
   - **Notes**, when there are any: *"‹n› parts of this file won't be carried over or were changed
     to fit."* Below it, a list of lists in `aria-label="Not carried over"`: one entry per kind present, in core's
     order of kinds, each a level-5 heading with the fixed wording of `components/import-notes.ts` (for example "Trust
     boundary lines (not imported)" or "Statuses Specter does not have (imported with the default)") over its
     items. Each item shows its `label` as text (or "Unnamed"), what was done where the heading does not say (for
     example "privilege level", "enlarged to 40 × 40", "TBA"), and its `path` in a `<code>` element. The wording is a
     table typed by core's list of kinds, so a new kind cannot ship without words.
   - **No notes**: *"Everything in this file will be imported."*
   - **Buttons**: "Import" and "Cancel".
   - **A refusal** from the check shows *"This file can't be imported"* with the message, plus
     "Choose another file".
4. **Importing**: the status line says *"Importing…"*, and both buttons are disabled.
5. **Done** (FR-013a, FR-016, US1/AC2, US4/AC2). The user is taken to what was created whenever it is one threat model:
   - **One threat model created**: go to `/threat-models/{id}`. When the import's answer has notes (`summary.notes` is not
     empty), the **import's own `summary`** (not the preview's) travels in the navigation state, as
     `{ state: { importSummary } }`. `ThreatModelPage` renders `ImportLeftOut`: a region labelled *"What the import left
     out"*, below the page's error line and above its title, with a level-2 heading of that text (which takes the focus), *"‹n›
     parts of this file weren't carried over or were changed to fit."*, the same grouped list as the preview, and a
     **Dismiss** button that removes it.
     - **Shown once**: the component keeps the summary in its own state and replaces the history entry with one without
       state, so a reload or a later visit shows the page as before; moving between the page's views (Diagram, Threats)
       keeps it until it is dismissed.
     - **Read defensively**: the state is parsed with core's `ImportSummary`; anything that is not a summary, or has no notes,
       shows nothing.
     - **Nothing was left out**: no state is passed and no region is shown.
   - **Several threat models created**: the user cannot be taken to all of them. With notes, they stay on the project page and
     see a result panel, drawn from the import's answer. Its heading, *"Imported"*, takes the focus; then, for each threat model
     created, *"‹name›: ‹n› elements, ‹n› threats, ‹n› mitigations."* and a link *"Open ‹name›"* to `/threat-models/{id}`; then
     *"‹n› parts of this file weren't carried over or were changed to fit."* and the same grouped list as the preview. A **Done**
     button closes the panel, puts *"Imported ‹n› threat models."* in the status line, and moves the focus to it. With no
     notes, the panel closes at once and the same status line is shown (and takes the focus), and the list is refreshed.
   - **A failure** (400, 404, 409) returns to the preview, showing the message and keeping the
     names. A 400 on `names.i` is shown on that name field.

## Accessibility

- Every control is labelled.
- The preview heading is focused when it appears.
- On a threat model page reached from an import, the "What the import left out" heading is focused when the page opens, and
  **Dismiss** moves the focus to the page's title (the button that had it is gone), as **Done** moves it to the status line.
- Notes form a list of lists with headings.
- Status changes are announced through the existing `role="status"` line.
- Errors use `ErrorSummary` and field errors use `FormField`, as elsewhere.

## Text safety

Labels, names and messages from the file or the server are rendered as React text, never as HTML,
and a `path` only inside `<code>`.

## Tests

- **Unit** (Vitest with Testing Library):
  - `ExportModel.test.tsx`;
  - `ImportThreatModel.test.tsx`: each step and state of data-model.md, "Web state", the size check
    done before reading, renaming, a failure returning to the preview, and hostile labels shown as
    text; where a one-model import navigates, and what it hands over;
  - `ThreatModelPage.import.test.tsx`: the region from navigation state, its list and Dismiss, that it stays across the
    page's views, that the history entry loses its state, and that nothing shows without a summary or notes;
  - `detectFormat` in core.
- **Browser**:
  - `report.spec.ts` (Phase 2 Definition of Done flow): export OTM, import it, and compare;
  - `exchange.spec.ts`: the Specter round trip through the UI, a Threat Dragon demo with notes (the user lands on the model,
    the region lists what was left out, and a reload shows none), and a refusal;
  - `exchange-large.spec.ts`: export and import at the bound.
