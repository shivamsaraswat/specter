import {
  IMPACTS,
  LIKELIHOODS,
  STRIDE_CATEGORIES,
  THREAT_STATUSES,
  ThreatCreateInput,
  ThreatUpdateInput,
  type Impact,
  type Likelihood,
  type StrideCategory,
  type ThreatRecord,
  type ThreatStatus,
} from '@specter/core';
import { useState, type FormEvent } from 'react';
import { zodFieldErrors } from '../api/errors.js';
import { ErrorSummary } from './ErrorSummary.js';
import { FormField } from './FormField.js';
import { useSubmit } from './useSubmit.js';

interface ThreatFormProps {
  threatModelId: string;
  // Present when editing: only the fields that changed are sent.
  initial?: ThreatRecord;
  onSubmit: (input: ThreatCreateInput | ThreatUpdateInput) => Promise<unknown>;
  onCancel: () => void;
}

// In the order the form shows them, which is the order a failure is announced and focused in.
const LABELS = {
  title: 'Title',
  category: 'Category',
  likelihood: 'Likelihood',
  impact: 'Impact',
  status: 'Status',
  description: 'Description',
};
const label = (value: string): string => value.replace('_', ' ');

// Creates or edits a threat. Threats made here are always model-level (no element) and always origin
// "manual": the form offers no other origin and never sends one on an edit. Risk is derived by the
// server and shown, never edited (spec FR-011, FR-012).
export function ThreatForm({ threatModelId, initial, onSubmit, onCancel }: ThreatFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<StrideCategory | ''>(initial?.category ?? '');
  const [likelihood, setLikelihood] = useState<Likelihood | ''>(initial?.likelihood ?? '');
  const [impact, setImpact] = useState<Impact | ''>(initial?.impact ?? '');
  const [status, setStatus] = useState<ThreatStatus>(initial?.status ?? 'open');
  const { errors, setErrors, busy, run, formRef, summary } = useSubmit(LABELS);
  const editing = initial !== undefined;
  // The add form and an edit form can be open together, so each field's id carries the threat's own id.
  const idPrefix = `threat-${initial?.id ?? 'new'}`;

  function onFormSubmit(event: FormEvent): void {
    event.preventDefault();
    void run(async () => {
      if (initial) {
        const changed: Record<string, string> = {};
        if (title.trim() !== initial.title) changed.title = title;
        if (description.trim() !== initial.description) changed.description = description;
        if (category !== initial.category) changed.category = category;
        if (likelihood !== initial.likelihood) changed.likelihood = likelihood;
        if (impact !== initial.impact) changed.impact = impact;
        if (status !== initial.status) changed.status = status;
        if (Object.keys(changed).length === 0) {
          onCancel();
          return;
        }
        const parsed = ThreatUpdateInput.safeParse(changed);
        if (!parsed.success) {
          setErrors(zodFieldErrors(parsed.error));
          return;
        }
        await onSubmit(parsed.data);
        return;
      }

      const parsed = ThreatCreateInput.safeParse({
        threat_model_id: threatModelId,
        element_id: null,
        category: category || undefined,
        title,
        description,
        likelihood: likelihood || undefined,
        impact: impact || undefined,
        status,
        origin: 'manual',
      });
      // An unmade choice gets a plain message instead of the schema's "invalid option".
      const missing: Record<string, string> = {};
      if (!category) missing.category = 'Choose a category';
      if (!likelihood) missing.likelihood = 'Choose a likelihood';
      if (!impact) missing.impact = 'Choose an impact';
      if (!parsed.success || Object.keys(missing).length > 0) {
        setErrors({ fields: { ...(parsed.success ? {} : zodFieldErrors(parsed.error).fields), ...missing }, form: null });
        return;
      }
      await onSubmit(parsed.data);
    });
  }

  return (
    <form ref={formRef} aria-label={editing ? 'Edit threat' : 'Add threat'} onSubmit={onFormSubmit} noValidate>
      <ErrorSummary message={summary} />
      <FormField id={`${idPrefix}-title`} label="Title" error={errors.fields.title}>
        {(control) => <input {...control} type="text" value={title} onChange={(event) => setTitle(event.target.value)} />}
      </FormField>
      <FormField id={`${idPrefix}-category`} label="Category" error={errors.fields.category}>
        {(control) => (
          <select {...control} value={category} onChange={(event) => setCategory(event.target.value as StrideCategory | '')}>
            <option value="">Select…</option>
            {STRIDE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id={`${idPrefix}-likelihood`} label="Likelihood" error={errors.fields.likelihood}>
        {(control) => (
          <select {...control} value={likelihood} onChange={(event) => setLikelihood(event.target.value as Likelihood | '')}>
            <option value="">Select…</option>
            {LIKELIHOODS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id={`${idPrefix}-impact`} label="Impact" error={errors.fields.impact}>
        {(control) => (
          <select {...control} value={impact} onChange={(event) => setImpact(event.target.value as Impact | '')}>
            <option value="">Select…</option>
            {IMPACTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id={`${idPrefix}-status`} label="Status" error={errors.fields.status}>
        {(control) => (
          <select {...control} value={status} onChange={(event) => setStatus(event.target.value as ThreatStatus)}>
            {THREAT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id={`${idPrefix}-description`} label="Description" error={errors.fields.description}>
        {(control) => (
          <textarea {...control} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        )}
      </FormField>
      <p>
        Origin: <span>{initial?.origin ?? 'manual'}</span>
      </p>
      {initial && (
        <p>
          Risk: <span>{initial.risk}</span>
        </p>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save' : 'Add threat'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
