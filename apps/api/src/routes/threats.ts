import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

const STRIDE_CATEGORIES = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
] as const;
type StrideCategory = (typeof STRIDE_CATEGORIES)[number];

const SEVERITIES = ['Low', 'Medium', 'High'] as const;
type Severity = (typeof SEVERITIES)[number];

const COLUMNS = 'id, title, stride_category, severity, description, created_at';

interface ThreatEntry {
  id: number;
  title: string;
  stride_category: StrideCategory;
  severity: Severity;
  description: string;
  created_at: string;
}

interface ThreatFields {
  title?: string;
  stride_category?: StrideCategory;
  severity?: Severity;
  description?: string;
}

type ValidateResult = { ok: true; value: ThreatFields } | { ok: false; error: string };

function isStrideCategory(value: unknown): value is StrideCategory {
  return typeof value === 'string' && (STRIDE_CATEGORIES as readonly string[]).includes(value);
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

// Returns { value } on success or { error } on failure. With partial=true, absent fields are skipped.
function validate(body: unknown, { partial = false }: { partial?: boolean } = {}): ValidateResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const input = body as Record<string, unknown>;
  const value: ThreatFields = {};

  if (input.title !== undefined || !partial) {
    if (typeof input.title !== 'string' || !input.title.trim()) {
      return { ok: false, error: 'title is required' };
    }
    value.title = input.title.trim();
  }
  if (input.stride_category !== undefined || !partial) {
    if (!isStrideCategory(input.stride_category)) {
      return { ok: false, error: `stride_category must be one of: ${STRIDE_CATEGORIES.join(', ')}` };
    }
    value.stride_category = input.stride_category;
  }
  if (input.severity !== undefined || !partial) {
    if (!isSeverity(input.severity)) {
      return { ok: false, error: `severity must be one of: ${SEVERITIES.join(', ')}` };
    }
    value.severity = input.severity;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string') {
      return { ok: false, error: 'description must be a string' };
    }
    value.description = input.description;
  }
  return { ok: true, value };
}

function parseId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  return id;
}

router.get('/', async (_req: Request, res: Response) => {
  const { rows } = await db.query<ThreatEntry>(
    `SELECT ${COLUMNS} FROM threat_entries ORDER BY created_at DESC, id DESC`,
  );
  res.json(rows);
});

router.post('/', async (req: Request, res: Response) => {
  const result = validate(req.body);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const { value } = result;

  const { rows } = await db.query<ThreatEntry>(
    `INSERT INTO threat_entries (title, stride_category, severity, description)
     VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [value.title, value.stride_category, value.severity, value.description ?? ''],
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const result = validate(req.body, { partial: true });
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const { value } = result;

  const fields = Object.keys(value) as (keyof ThreatFields)[];
  if (fields.length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' });
    return;
  }

  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const { rows } = await db.query<ThreatEntry>(
    `UPDATE threat_entries SET ${sets} WHERE id = $${fields.length + 1} RETURNING ${COLUMNS}`,
    [...fields.map((f) => value[f]), id],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Threat not found' });
    return;
  }
  res.json(rows[0]);
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { rowCount } = await db.query('DELETE FROM threat_entries WHERE id = $1', [id]);
  if (rowCount === 0) {
    res.status(404).json({ error: 'Threat not found' });
    return;
  }
  res.status(204).end();
});

export default router;
