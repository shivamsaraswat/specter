const express = require('express');
const pool = require('../db');

const router = express.Router();

const STRIDE_CATEGORIES = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
];
const SEVERITIES = ['Low', 'Medium', 'High'];
const COLUMNS = 'id, title, stride_category, severity, description, created_at';

// Returns { value } on success or { error } on failure. With partial=true, absent fields are skipped.
function validate(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const value = {};

  if (body.title !== undefined || !partial) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return { error: 'title is required' };
    }
    value.title = body.title.trim();
  }
  if (body.stride_category !== undefined || !partial) {
    if (!STRIDE_CATEGORIES.includes(body.stride_category)) {
      return { error: `stride_category must be one of: ${STRIDE_CATEGORIES.join(', ')}` };
    }
    value.stride_category = body.stride_category;
  }
  if (body.severity !== undefined || !partial) {
    if (!SEVERITIES.includes(body.severity)) {
      return { error: `severity must be one of: ${SEVERITIES.join(', ')}` };
    }
    value.severity = body.severity;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return { error: 'description must be a string' };
    }
    value.description = body.description;
  }
  return { value };
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  return id;
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM threat_entries ORDER BY created_at DESC, id DESC`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { value, error } = validate(req.body);
  if (error) return res.status(400).json({ error });

  const { rows } = await pool.query(
    `INSERT INTO threat_entries (title, stride_category, severity, description)
     VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [value.title, value.stride_category, value.severity, value.description ?? '']
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { value, error } = validate(req.body, { partial: true });
  if (error) return res.status(400).json({ error });

  const fields = Object.keys(value);
  if (fields.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });

  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `UPDATE threat_entries SET ${sets} WHERE id = $${fields.length + 1} RETURNING ${COLUMNS}`,
    [...fields.map((f) => value[f]), id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Threat not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const { rowCount } = await pool.query('DELETE FROM threat_entries WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Threat not found' });
  res.status(204).end();
});

module.exports = router;
