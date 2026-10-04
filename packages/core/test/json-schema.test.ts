import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  ElementRecord,
  MitigationCreateInput,
  ProjectCreateInput,
  ProjectRecord,
  ThreatCreateInput,
  jsonValue,
  toJsonSchemaOverride,
} from '../src/index.js';
import { optionalText, requiredText } from '../src/fields.js';

// The OpenAPI document in apps/api is built from these schemas (research #4). Each case below pins
// one of the problems found while prototyping that, so a change to Zod or to fields.ts that brings
// one back fails here, in core, instead of in the API's document tests.

type Components = Record<string, unknown>;

function toComponents(io: 'input' | 'output', add: (registry: z.core.$ZodRegistry<{ id: string }>) => void): Components {
  const registry = z.registry<{ id: string }>();
  add(registry);
  return z.toJSONSchema(registry, {
    io,
    target: 'draft-2020-12',
    unrepresentable: 'any',
    uri: (id) => `#/components/schemas/${id}`,
    override: toJsonSchemaOverride,
  }).schemas;
}

function at(value: unknown, ...path: (string | number)[]): unknown {
  return path.reduce<unknown>((node, key) => (node as Record<string | number, unknown> | undefined)?.[key], value);
}

describe('JSON Schema from the shared definitions', () => {
  it('carries the input length limits as maxLength', () => {
    const schemas = toComponents('input', (r) => {
      r.add(ProjectCreateInput, { id: 'ProjectCreateInput' });
      r.add(MitigationCreateInput, { id: 'MitigationCreateInput' });
      r.add(ThreatCreateInput, { id: 'ThreatCreateInput' });
    });
    expect(at(schemas, 'ProjectCreateInput', 'properties', 'name', 'maxLength')).toBe(200);
    expect(at(schemas, 'ProjectCreateInput', 'properties', 'description', 'maxLength')).toBe(10_000);
    expect(at(schemas, 'MitigationCreateInput', 'properties', 'description', 'maxLength')).toBe(10_000);
    // A nullable field keeps its limit on the string branch.
    expect(at(schemas, 'MitigationCreateInput', 'properties', 'external_ref', 'anyOf', 0, 'maxLength')).toBe(2048);
    expect(at(schemas, 'ThreatCreateInput', 'properties', 'library_ref', 'anyOf', 0, 'maxLength')).toBe(200);
  });

  it('describes a stored timestamp as an ISO date-time string', () => {
    const schemas = toComponents('output', (r) => r.add(ProjectRecord, { id: 'ProjectRecord' }));
    for (const field of ['created_at', 'updated_at']) {
      expect(at(schemas, 'ProjectRecord', 'properties', field)).toEqual({ type: 'string', format: 'date-time' });
    }
  });

  it('names the recursive JSON value, so every reference resolves from the document root', () => {
    const schemas = toComponents('output', (r) => {
      r.add(jsonValue, { id: 'JsonValue' });
      r.add(ElementRecord, { id: 'ElementRecord' });
    });
    expect(Object.keys(schemas).sort()).toEqual(['ElementRecord', 'JsonValue']);
    expect(at(schemas, 'ElementRecord', 'properties', 'properties', 'additionalProperties')).toEqual({
      $ref: '#/components/schemas/JsonValue',
    });
    expect(JSON.stringify(schemas)).not.toContain('$defs');
    expect(JSON.stringify(schemas)).not.toContain('__shared');
  });
});

describe('validation after adding the length metadata', () => {
  it('still counts code points and trims', () => {
    const name = requiredText(200);
    expect(name.safeParse('😀'.repeat(200)).success).toBe(true);
    expect(name.safeParse('😀'.repeat(201)).success).toBe(false);
    expect(name.parse('  a  ')).toBe('a');
    expect(name.safeParse('   ').success).toBe(false);
  });

  it('still allows empty optional text, and still caps it', () => {
    const description = optionalText(10_000);
    expect(description.parse('')).toBe('');
    expect(description.safeParse('x'.repeat(10_001)).success).toBe(false);
  });
});
