import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ElementBatchInput,
  ElementBatchResult,
  ElementCreateInput,
  ElementInputBase,
  ElementRecord,
  ElementUpdateInput,
  MAX_ELEMENTS,
} from '../src/index.js';

const model = randomUUID();
const valid = { threat_model_id: model, type: 'process', name: 'API' };

describe('ElementCreateInput', () => {
  it('applies the documented defaults', () => {
    expect(ElementCreateInput.parse(valid)).toEqual({
      ...valid,
      properties: {},
      layout: null,
      source_element_id: null,
      target_element_id: null,
      parent_boundary_id: null,
    });
  });

  it.each(['external_entity', 'process', 'data_store', 'data_flow', 'trust_boundary'])('accepts type %s', (type) => {
    expect(ElementCreateInput.safeParse({ ...valid, type }).success).toBe(true);
  });

  it('rejects an unknown type, an empty name and a non-UUID reference', () => {
    expect(ElementCreateInput.safeParse({ ...valid, type: 'actor' }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, name: ' ' }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, source_element_id: 'x' }).success).toBe(false);
  });

  it('requires properties to be a JSON object, and layout to be an object or null', () => {
    expect(ElementCreateInput.safeParse({ ...valid, properties: [] }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, layout: 1 }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, layout: { x: 1, y: 2 } }).success).toBe(true);
    expect(ElementCreateInput.safeParse({ ...valid, layout: null }).success).toBe(true);
  });

  it('validates properties for the element type (FR-017)', () => {
    const properties = { tags: ['db', 'pii'], flags: { stores_sensitive_data: true, encrypted_at_rest: false } };
    expect(ElementCreateInput.parse({ ...valid, type: 'data_store', properties }).properties).toEqual(properties);
    expect(ElementCreateInput.safeParse({ ...valid, type: 'data_store', properties: { color: 'red' } }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, type: 'data_store', properties: { flags: { runs_privileged: true } } }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, type: 'trust_boundary', properties: { flags: { internet_facing: true } } }).success).toBe(false);
  });

  it('validates layout for the element type', () => {
    expect(ElementCreateInput.safeParse({ ...valid, type: 'process', layout: { x: 1, y: 2 } }).success).toBe(true);
    expect(ElementCreateInput.safeParse({ ...valid, type: 'process', layout: { x: 1, y: 2, width: 90, height: 90 } }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, type: 'trust_boundary', layout: { x: 1, y: 2 } }).success).toBe(false);
    expect(ElementCreateInput.safeParse({ ...valid, type: 'trust_boundary', layout: { x: 1, y: 2, width: 90, height: 90 } }).success).toBe(true);
    expect(ElementCreateInput.safeParse({ ...valid, type: 'data_flow', layout: { x: 1, y: 2 } }).success).toBe(false);
  });

  it.each(['id', 'created_at', 'updated_at', 'foo'])('rejects %s', (key) => {
    expect(ElementCreateInput.safeParse({ ...valid, [key]: 'v' }).success).toBe(false);
  });
});

describe('ElementInputBase', () => {
  it('is the strict building block: nothing defaulted, unknown keys rejected', () => {
    expect(ElementInputBase.safeParse(valid).success).toBe(false);
    const full = ElementCreateInput.parse(valid);
    expect(ElementInputBase.parse(full)).toEqual(full);
    expect(ElementInputBase.safeParse({ ...full, foo: 1 }).success).toBe(false);
  });
});

describe('ElementUpdateInput', () => {
  it('applies no defaults, so an update cannot reset properties (the .partial() default trap)', () => {
    const parsed = ElementUpdateInput.parse({ name: 'x' });
    expect(parsed).toEqual({ name: 'x' });
    expect('properties' in parsed).toBe(false);
    expect('layout' in parsed).toBe(false);
  });

  it('does not accept threat_model_id, but accepts type', () => {
    expect(ElementUpdateInput.safeParse({ threat_model_id: model }).success).toBe(false);
    expect(ElementUpdateInput.parse({ type: 'data_store' })).toEqual({ type: 'data_store' });
  });
});

describe('ElementRecord', () => {
  it('parses a stored row', () => {
    const row = {
      id: randomUUID(),
      ...valid,
      properties: { internet_facing: true },
      layout: null,
      source_element_id: null,
      target_element_id: null,
      parent_boundary_id: null,
      created_at: '2026-10-04T10:00:00.000Z',
      updated_at: '2026-10-04T10:00:00.000Z',
    };
    expect(ElementRecord.parse(row)).toEqual(row);
  });
});

describe('ElementRecord (legacy rows stay readable)', () => {
  it('parses a row whose properties and layout are outside the vocabulary (research #3)', () => {
    const row = {
      id: randomUUID(),
      ...valid,
      properties: { color: 'red', nested: { a: [1] } },
      layout: { anything: 1 },
      source_element_id: null,
      target_element_id: null,
      parent_boundary_id: null,
      created_at: '2026-10-04T10:00:00.000Z',
      updated_at: '2026-10-04T10:00:00.000Z',
    };
    expect(ElementRecord.parse(row)).toEqual(row);
  });
});

describe('ElementBatchInput', () => {
  const op = { op: 'create', element: { type: 'process', name: 'API' } } as const;
  const many = (n: number) => Array.from({ length: n }, () => op);

  it('accepts 1 to 200 operations and applies the create defaults', () => {
    const parsed = ElementBatchInput.parse({ operations: [op] });
    expect(parsed.operations[0]).toEqual({
      op: 'create',
      element: { type: 'process', name: 'API', properties: {}, layout: null, source_element_id: null, target_element_id: null, parent_boundary_id: null },
    });
    expect(ElementBatchInput.safeParse({ operations: many(200) }).success).toBe(true);
  });

  it('rejects 0 and 201 operations', () => {
    expect(ElementBatchInput.safeParse({ operations: [] }).success).toBe(false);
    expect(ElementBatchInput.safeParse({ operations: many(201) }).success).toBe(false);
  });

  it('accepts a create with its own id, and rejects threat_model_id in it', () => {
    const id = randomUUID();
    expect(ElementBatchInput.parse({ operations: [{ op: 'create', element: { id, type: 'process', name: 'A' } }] }).operations[0]).toMatchObject({ element: { id } });
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'create', element: { threat_model_id: model, type: 'process', name: 'A' } }] }).success).toBe(false);
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'create', element: { id: 'x', type: 'process', name: 'A' } }] }).success).toBe(false);
  });

  it('validates a create element for its type', () => {
    const bad = { op: 'create', element: { type: 'data_store', name: 'DB', properties: { flags: { runs_privileged: true } } } };
    expect(ElementBatchInput.safeParse({ operations: [bad] }).success).toBe(false);
  });

  it('takes an update with an id and at least one change, and a delete with an id', () => {
    const id = randomUUID();
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'update', id, changes: { name: 'B' } }] }).success).toBe(true);
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'update', id, changes: {} }] }).success).toBe(false);
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'update', id: 'x', changes: { name: 'B' } }] }).success).toBe(false);
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'delete', id }] }).success).toBe(true);
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'delete' }] }).success).toBe(false);
  });

  it('rejects an unknown op and unknown top-level keys', () => {
    expect(ElementBatchInput.safeParse({ operations: [{ op: 'move', id: randomUUID() }] }).success).toBe(false);
    expect(ElementBatchInput.safeParse({ operations: [op], extra: 1 }).success).toBe(false);
  });
});

describe('ElementBatchResult', () => {
  it('is { elements, deleted }', () => {
    expect(ElementBatchResult.parse({ elements: [], deleted: [randomUUID()] }).elements).toEqual([]);
    expect(ElementBatchResult.safeParse({ elements: [] }).success).toBe(false);
  });
});

describe('MAX_ELEMENTS', () => {
  it('is 1,000 (FR-001a)', () => {
    expect(MAX_ELEMENTS).toBe(1000);
  });
});
