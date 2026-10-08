# Contract: Rule File Format

The format contributors write. The authoritative guide for contributors is
`packages/threat-library/README.md` (FR-023), which must say the same as this contract; the field
rules are in [data-model.md](../data-model.md). The tests in `test/mistakes.test.ts` enforce every
rule below.

## Files

```text
packages/threat-library/rules/
├── external_entity/<id>.yaml
├── process/<id>.yaml
├── data_store/<id>.yaml
├── data_flow/<id>.yaml
├── ids.yaml        # every id ever issued (the registry)
└── retired.yaml
```

- **Rule files**: one rule per file. The file is named `<id>.yaml` and sits in the directory named
  after its `element_type`.
- **Files the loader ignores**: names starting with `.`.
- **Anything else is a load error**: another root file, another directory, a nested directory, or
  an extension other than `.yaml`. The same goes for a missing `ids.yaml` or `retired.yaml`.
- **YAML rules**: YAML 1.2, one document per file, UTF-8. No anchors, aliases or tags, and no
  duplicate keys.

## A rule

```yaml
id: df-disclosure-plaintext-crossing
element_type: data_flow
category: Information Disclosure
variant_group: df-plaintext-transit
title: "Data from {{source}} to {{target}} readable in transit across a trust boundary"
description: >-
  {{element}} carries data from {{source}} to {{target}} without encryption, and the connection
  leaves one trust zone for another. Anyone on the network path between the zones can read it.
likelihood: High
impact: High
when:
  flags:
    encrypted_in_transit: no
  flow:
    crosses_trust_boundary: yes
mitigations:
  - Encrypt the connection with TLS 1.2 or later and reject plaintext connections.
  - Authenticate the server certificate on the client side.
references:
  - CWE-319
  - CAPEC-94
examples:
  applies:
    - flags: { encrypted_in_transit: not_assessed }
      flow: { crosses_trust_boundary: yes, source_type: external_entity, target_type: process }
  does_not_apply:
    - flags: { encrypted_in_transit: yes }
      flow: { crosses_trust_boundary: yes, source_type: external_entity, target_type: process }
    - flow: { crosses_trust_boundary: no, source_type: process, target_type: process }
```

**Writing notes** (YAML 1.2 core schema):

- Write conditions as `yes` / `no`; they are read as text. An unquoted `true` or `false` is rejected
  with "write yes or no".
- Use `{{element}}`, `{{source}}` and `{{target}}` in the title and description only. A `{{…}}` in a
  mitigation is an error, because mitigations are copied as written.
- Quote a title or description that starts with `{{`. Unquoted, YAML reads it as a mapping.
- Write a description as a folded block scalar (`>-`): the lines are joined into one paragraph and a
  blank line starts a new one, so a candidate's text has no hard line breaks. `|` keeps line breaks.
  The text is trimmed before checking and filling in.
- `retired_on: 2026-10-08` is read as text and must be a real date.

## `ids.yaml`

```yaml
# Every rule id ever issued. Add new ids in sorted order; never remove one.
ids:
  - df-disclosure-plaintext-crossing
  - p-old-rule
  - p-repudiation-no-audit-log
```

It starts as `ids: []`. Every active rule and every retired id must be listed, and every listed id
must be one or the other (FR-019a).

## `retired.yaml`

```yaml
retired:
  - id: p-old-rule
    retired_on: 2026-11-02
    reason: Split into separate internet and internal variants.
    replaced_by: [p-new-rule-internet, p-new-rule-internal]
```

The file starts as `retired: []`.

## Changing a rule

| Change | How |
|---|---|
| Add a rule | Add the file, and add its id to `ids.yaml` in sorted order. |
| Better wording, mitigations, references, defaults, examples, variant group | Edit the file; the `id` stays (FR-021). |
| Different element type, category or conditions (a different threat), or a new id | Delete the file, add a retirement record, add a new rule with a new id, and add the new id to `ids.yaml`. The old id stays in `ids.yaml`. |
| Withdraw a rule | Delete the file and add a retirement record in the same change (FR-019). Its id stays in `ids.yaml`. |

## Error messages

Each problem is reported on its own line:

```text
<file relative to rules/> (<rule id>): <field path>: <problem>
```

When the id can't be read (a YAML error, or a missing `id`), the file name without `.yaml` stands in
for it. Only an entry that isn't a rule file (a stray file or directory) is reported without one.
All problems are reported together, and the library refuses to load while any remain (FR-012,
FR-013).
