import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ElementCreateInput,
  MitigationCreateInput,
  ProjectCreateInput,
  ThreatCreateInput,
  formatValidationError,
} from '../src/index.js';

const validThreat = () => ({
  threat_model_id: randomUUID(),
  category: 'Spoofing',
  title: 'A threat',
  likelihood: 'Low',
  impact: 'High',
  origin: 'manual',
});

function messageFor(schema: { safeParse(v: unknown): { success: boolean; error?: unknown } }, input: unknown): string {
  const result = schema.safeParse(input);
  expect(result.success, 'expected the input to be rejected').toBe(false);
  return formatValidationError(result.error as Parameters<typeof formatValidationError>[0]);
}

describe('formatValidationError names the offending field (FR-033)', () => {
  it('for an unknown key', () => {
    expect(messageFor(ThreatCreateInput, { ...validThreat(), risk: 'Low' })).toContain('unknown field "risk"');
  });

  it('for a wrong type', () => {
    expect(messageFor(ThreatCreateInput, { ...validThreat(), likelihood: 5 })).toContain('likelihood:');
  });

  it('for an out-of-range enumerated value', () => {
    expect(messageFor(ThreatCreateInput, { ...validThreat(), status: 'closed' })).toContain('status:');
  });

  it('for an empty required text', () => {
    expect(messageFor(ThreatCreateInput, { ...validThreat(), title: '' })).toContain('title:');
  });

  it('for text that is too long', () => {
    expect(messageFor(ProjectCreateInput, { name: 'x'.repeat(201) })).toContain('name:');
  });

  it('for a URL with the wrong scheme', () => {
    const message = messageFor(MitigationCreateInput, {
      threat_id: randomUUID(),
      description: 'Fix it',
      external_ref: 'javascript:alert(1)',
    });
    expect(message).toContain('external_ref:');
  });

  it('with a dotted path for a nested field', () => {
    const message = messageFor(ElementCreateInput, {
      threat_model_id: randomUUID(),
      type: 'process',
      name: 'API',
      properties: { x: () => 1 },
    });
    expect(message).toContain('properties.x');
  });

  it('with the message alone when the input is not an object', () => {
    const message = messageFor(ProjectCreateInput, null);
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/^[a-z_.]+:/);
  });
});

describe('formatValidationError output shape', () => {
  it('is a single line with one clause per issue, joined by "; "', () => {
    const message = messageFor(ThreatCreateInput, { ...validThreat(), title: '', likelihood: 'x', extra: 1 });
    expect(message).not.toContain('\n');
    expect(message.split('; ')).toHaveLength(3);
  });

  it('never echoes a rejected value back', () => {
    const message = messageFor(ThreatCreateInput, { ...validThreat(), status: 'SECRET-VALUE', title: 5 });
    expect(message).not.toContain('SECRET-VALUE');
  });

  it('keeps a hostile key name on one line and bounded', () => {
    const message = messageFor(ProjectCreateInput, { name: 'ok', ['bad\nkey' + 'k'.repeat(500)]: 1 });
    expect(message).not.toMatch(/[\r\n]/);
    expect(message.length).toBeLessThan(200);
  });
});
