import { describe, expect, it } from 'vitest';
import { reportFilename } from '../../src/report/filename.js';

// research #13: <slug>-report-<YYYY-MM-DD>.<ext>, the date being the export instant's UTC date.

const at = new Date('2026-10-10T14:03:30Z');

describe('reportFilename', () => {
  it('slugs the threat model name and adds the date and extension', () => {
    expect(reportFilename('Payments API', 'markdown', at)).toBe('payments-api-report-2026-10-10.md');
    expect(reportFilename('Payments API', 'html', at)).toBe('payments-api-report-2026-10-10.html');
  });

  it('normalises accents and lower-cases', () => {
    expect(reportFilename('Café Ünïcode', 'markdown', at)).toBe('cafe-unicode-report-2026-10-10.md');
  });

  it('turns each run of other characters into one hyphen, and trims hyphens from the ends', () => {
    expect(reportFilename('  --Hello,   World!!  ', 'markdown', at)).toBe('hello-world-report-2026-10-10.md');
    expect(reportFilename('a/b\\c:d', 'markdown', at)).toBe('a-b-c-d-report-2026-10-10.md');
  });

  it('cuts the slug at 60 characters, leaving no trailing hyphen', () => {
    const name = `${'a'.repeat(59)} ${'b'.repeat(20)}`;
    const file = reportFilename(name, 'markdown', at);
    expect(file).toBe(`${'a'.repeat(59)}-report-2026-10-10.md`);
    expect(reportFilename('a'.repeat(100), 'markdown', at)).toBe(`${'a'.repeat(60)}-report-2026-10-10.md`);
  });

  it.each(['日本語', '!!!', ''])('falls back to "threat-model" when nothing is left of %j', (name) => {
    expect(reportFilename(name, 'markdown', at)).toBe('threat-model-report-2026-10-10.md');
  });

  it('uses the UTC date of the instant, whatever offset it was written with', () => {
    expect(reportFilename('x', 'markdown', new Date('2026-10-10T23:30:00-05:00'))).toBe('x-report-2026-10-11.md');
    expect(reportFilename('x', 'markdown', new Date('2026-10-11T00:30:00+05:00'))).toBe('x-report-2026-10-10.md');
  });

  it('contains nothing but letters, digits, hyphens and one dot', () => {
    expect(reportFilename('<script>"q"\n\r;', 'html', at)).toMatch(/^[a-z0-9-]+\.html$/);
  });
});
