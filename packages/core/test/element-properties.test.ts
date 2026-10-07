import { describe, expect, it } from 'vitest';
import { ELEMENT_FLAGS, ELEMENT_TYPES, elementPropertiesSchema } from '../src/index.js';

describe('ELEMENT_FLAGS', () => {
  it('lists exactly the flags of the spec (FR-015)', () => {
    expect(ELEMENT_FLAGS).toEqual({
      external_entity: ['authenticated', 'internet_facing'],
      process: ['internet_facing', 'requires_authentication', 'handles_sensitive_data', 'runs_privileged'],
      data_store: ['stores_sensitive_data', 'encrypted_at_rest', 'internet_facing'],
      data_flow: ['encrypted_in_transit', 'authenticated', 'carries_sensitive_data'],
      trust_boundary: [],
    });
  });
});

describe('elementPropertiesSchema', () => {
  it.each(ELEMENT_TYPES)('accepts {} for %s: nothing assessed, no tags', (type) => {
    expect(elementPropertiesSchema(type).parse({})).toEqual({});
  });

  it.each(ELEMENT_TYPES)('accepts every flag of %s as true or false', (type) => {
    for (const flag of ELEMENT_FLAGS[type]) {
      expect(elementPropertiesSchema(type).parse({ flags: { [flag]: true } })).toEqual({ flags: { [flag]: true } });
      expect(elementPropertiesSchema(type).parse({ flags: { [flag]: false } })).toEqual({ flags: { [flag]: false } });
    }
  });

  it('keeps false distinct from an absent flag (not assessed, FR-015a)', () => {
    const parsed = elementPropertiesSchema('data_store').parse({ flags: { encrypted_at_rest: false } });
    expect(parsed.flags).toEqual({ encrypted_at_rest: false });
    expect(Object.hasOwn(parsed.flags ?? {}, 'internet_facing')).toBe(false);
  });

  it.each([1, 'yes', null, 'true', {}, []])('rejects %j as a flag value', (value) => {
    expect(elementPropertiesSchema('process').safeParse({ flags: { runs_privileged: value } }).success).toBe(false);
  });

  it('rejects a flag of another type with the flag and type named', () => {
    const result = elementPropertiesSchema('data_store').safeParse({ flags: { runs_privileged: true } });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('flag runs_privileged does not apply to data_store');
  });

  it('allows no flags on a trust boundary, but {} and absent are fine', () => {
    expect(elementPropertiesSchema('trust_boundary').safeParse({ flags: { internet_facing: true } }).success).toBe(false);
    expect(elementPropertiesSchema('trust_boundary').safeParse({ flags: {} }).success).toBe(true);
    expect(elementPropertiesSchema('trust_boundary').safeParse({ tags: ['Production VPC'] }).success).toBe(true);
  });

  it('rejects an unknown flag and an unknown top-level key without echoing their text', () => {
    const flag = elementPropertiesSchema('process').safeParse({ flags: { zz_secret_flag: true } });
    expect(flag.success).toBe(false);
    expect(JSON.stringify(flag.error?.issues)).toContain('properties: unknown flag');
    expect(JSON.stringify(flag.error?.issues)).not.toContain('zz_secret_flag');

    const key = elementPropertiesSchema('process').safeParse({ zz_secret_key: 1 });
    expect(key.success).toBe(false);
    expect(JSON.stringify(key.error?.issues)).toContain('properties: unknown key');
    expect(JSON.stringify(key.error?.issues)).not.toContain('zz_secret_key');
  });

  describe('tags (FR-016)', () => {
    const parse = (tags: unknown) => elementPropertiesSchema('process').safeParse({ tags });

    it('stores tags trimmed', () => {
      expect(parse([' nginx ', 'PostgreSQL 16']).data).toEqual({ tags: ['nginx', 'PostgreSQL 16'] });
    });

    it('accepts 1 to 50 characters after trimming', () => {
      expect(parse(['a']).success).toBe(true);
      expect(parse(['a'.repeat(50)]).success).toBe(true);
      expect(parse(['']).success).toBe(false);
      expect(parse(['   ']).success).toBe(false);
      expect(parse(['a'.repeat(51)]).success).toBe(false);
      expect(parse([` ${'a'.repeat(50)} `]).success).toBe(true);
    });

    it('accepts at most 20 tags', () => {
      const tags = (n: number) => Array.from({ length: n }, (_, i) => `tag${i}`);
      expect(parse(tags(20)).success).toBe(true);
      expect(parse(tags(21)).success).toBe(false);
    });

    it('rejects case-insensitive duplicates, after trimming', () => {
      expect(parse(['PostgreSQL', 'postgresql ']).success).toBe(false);
      expect(parse(['PostgreSQL', 'PostgreSQL 16']).success).toBe(true);
    });

    it('rejects non-strings and a non-array', () => {
      expect(parse([1]).success).toBe(false);
      expect(parse('nginx').success).toBe(false);
    });
  });
});
