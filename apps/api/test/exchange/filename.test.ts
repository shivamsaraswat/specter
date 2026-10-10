import { describe, expect, it } from 'vitest';
import { exchangeFilename } from '../../src/exchange/filename.js';
import { reportFilename } from '../../src/report/filename.js';

// <slug>-<YYYY-MM-DD>.<format>.json (research #3, contracts/exchange-api.md). The slug is the report's.

const exportedAt = new Date('2026-10-10T23:59:30Z');

describe('exchangeFilename', () => {
  it('names the Specter file after the model and the UTC export date', () => {
    expect(exchangeFilename('Payments API', 'specter', exportedAt)).toBe('payments-api-2026-10-10.specter.json');
  });

  it.each(['Payments API', 'Ünïcode & <b>html</b>', '', '!!!', 'x'.repeat(200), 'a/b\\c..d'])('uses the report slug for %j', (name) => {
    const slug = reportFilename(name, 'markdown', exportedAt).replace(/-report-2026-10-10\.md$/, '');
    expect(exchangeFilename(name, 'specter', exportedAt)).toBe(`${slug}-2026-10-10.specter.json`);
  });
});
