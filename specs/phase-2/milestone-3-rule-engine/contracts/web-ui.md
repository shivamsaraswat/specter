# Contract: Web UI for generating threats

What the browser shows and does. The Playwright and component tests assert these names, roles and
texts. Everything is rendered as text, never as markup (Phase 1 M6, FR-017).

## Generate bar (both tabs)

A bar directly under the "Threat model views" tab links. It is rendered inside the diagram editor
provider, so it is the same on the Diagram and Threats tabs.

| Element | Role and name | Behaviour |
|---|---|---|
| Button | `button` "Generate threats" | Starts a run. Disabled while a run is in progress (FR-017) |
| Live region | `status` | Shows progress, then the outcome, as in the table below |

**On click**:

1. If the diagram has unsaved changes, the region says "Saving your diagram changes first…" until the
   save queue settles (`whenSettled()`, research #12). The queue counts as settled-saved only when
   nothing is pending *and* its status is `saved`. A name being edited is committed by the button's
   blur, before the click.
   - **Settled as saved**: go on to step 2.
   - **Settled as failed**: stop and show "Your diagram has changes that could not be saved. Save
     them (Retry) before generating threats." No request is sent.
   - **Threat model gone**: the page's existing "no longer exists" handling applies.
2. The region says "Generating threats…". The client sends `POST …/threats/generate` with the body
   `{}`.
3. Whatever the outcome, the threats and mitigations lists are refetched.

**Outcomes**, shown in the live region:

| Outcome | Text |
|---|---|
| `200`, `created + existing > 0` or any stale change | "Generated threats: {created} created, {existing} already existed (of which {no_longer_stale} no longer stale), {newly_stale} newly stale." |
| `200`, all four counts are 0 | "No threats to generate: no rule applies to the elements of this diagram." |
| `200` with `skipped_elements` not empty | One of the two lines above, followed by "{n} element(s) skipped because their stored properties include keys Specter no longer uses: {names, joined with ', '}. Change any property of each in the diagram to clean it up, then generate again." Names come from the loaded elements list. An id that isn't in the list is shown as "an element that no longer exists" |
| `ApiError` 400–499 | The server's message |
| `ApiError` 500 carrying the app's JSON message `Internal server error` | "Generating threats failed. Nothing was saved. Try again." |
| A network error, or any other 5xx (a proxy's 502, 503, 504 or its own 500 page) | "The connection was lost before Specter answered, so the threats may or may not have been generated. Generating again is safe: it never creates duplicates." |

## Threat table

**Columns**: Title, Category, Likelihood, Impact, Risk, Status, Element, **Source**, Mitigations,
Actions.

- **Source cell**:
  - manual threat: "Manual";
  - rule threat: "Rule", followed by the rule id in a `<code>` element, for example "Rule
    `df-tampering-unencrypted`".
- **Title cell of a stale threat**: the title, then a "Stale" badge, then the reason as a paragraph,
  using the wording below. The badge has the accessible name "Stale".
- **Title cell of a threat that isn't stale**: unchanged.

**Stale reason wording** (`describeStale`):

| `stale` | Text |
|---|---|
| `conditions_unmet` | "The rule no longer applies: " followed by one clause per unmet condition, joined with "; " |
| `rule_retired` | "Rule retired on {retired_on}: {retirement_reason}." followed by " Replaced by: {ids joined with ', '}." when there are replacements |
| `rule_unknown` | "This rule is no longer in the library." |

**One clause per unmet condition**:

| `fact` | Clause |
|---|---|
| `element_type` | "it is for {type label, plural, lower case}; this element is a {type label, lower case}" |
| `flag` | "requires {flag label} to be {Yes/No}; it is {Yes/No/Not assessed}" |
| `crosses_trust_boundary` | "requires the flow to cross a trust boundary; it doesn't", or "requires the flow not to cross a trust boundary; it does" |
| `source_type` / `target_type` | "requires the {source/target} to be a {type label, lower case}; it is a {type label, lower case}" |

Type and flag labels are the editor's own (`TYPE_LABELS`, `flagLabel()`).

## Delete confirmation for a rule threat

The existing "Delete threat" dialog adds this sentence when the threat's `origin` is `rule`
(FR-016a):

> Generating threats again will create it again while its rule applies. To dismiss it for good, set
> its status to Not applicable instead.

Manual threats keep the current text.

## Unchanged

- **Deleting an element with threats** is still refused, and the existing dialog lists the linked
  threats (FR-013). The server's message no longer suggests reassigning them
  (generate-threats-api.md).
- **The threat form**: it never sends `origin` on an edit, nor `element_id` or `library_ref`, so
  editing a rule threat through it is unaffected.
