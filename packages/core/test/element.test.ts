import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ElementCreateInput, ElementRecord, ElementUpdateInput } from '../src/index.js';

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

  it('accepts nested JSON in properties', () => {
    const properties = { a: { b: [1, null, 'x'] }, tags: ['db', 'pii'] };
    expect(ElementCreateInput.parse({ ...valid, properties }).properties).toEqual(properties);
  });

  it.each(['id', 'created_at', 'updated_at', 'foo'])('rejects %s', (key) => {
    expect(ElementCreateInput.safeParse({ ...valid, [key]: 'v' }).success).toBe(false);
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
