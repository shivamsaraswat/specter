import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { REPORT_FORMATS, ReportQuery } from '../src/index.js';

// The query of the report operation (data-model.md §5). It is a shared core schema because every /api/v1 input is
// validated by one (constitution Principle I).

describe('REPORT_FORMATS', () => {
  it('lists the formats the API can produce', () => {
    expect([...REPORT_FORMATS]).toEqual(['markdown', 'html']);
  });
});

describe('ReportQuery', () => {
  it('accepts each format', () => {
    for (const format of REPORT_FORMATS) expect(ReportQuery.parse({ format })).toEqual({ format });
  });

  it('names both formats in its one message', () => {
    expect(ReportQuery.safeParse({ format: 'pdf' }).error?.issues[0]?.message).toBe('format must be markdown or html');
  });

  // A missing, unknown or repeated value, and an extra key, all get the one message: it names the formats and never
  // repeats what the client sent.
  it.each([
    ['nothing', {}],
    ['an unknown format', { format: 'pdf' }],
    ['an empty format', { format: '' }],
    ['a repeated parameter (an array)', { format: ['markdown', 'markdown'] }],
    ['a non-string', { format: 1 }],
    ['an extra key', { format: 'markdown', extra: '1' }],
  ])('refuses %s with one issue and one message', (_name, query) => {
    const result = ReportQuery.safeParse(query);
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe(`format must be ${REPORT_FORMATS.join(' or ')}`);
  });

  it('does not echo a rejected value', () => {
    const result = ReportQuery.safeParse({ format: '<script>x</script>', secret: 'hunter2' });
    expect(JSON.stringify(result.error?.issues)).not.toMatch(/script|hunter2/);
  });

  it('describes format as a string enum in the OpenAPI document', () => {
    const schema = z.toJSONSchema(ReportQuery, { io: 'input' });
    expect(schema.properties?.format).toMatchObject({ type: 'string', enum: [...REPORT_FORMATS] });
    expect(schema.required).toEqual(['format']);
  });
});
