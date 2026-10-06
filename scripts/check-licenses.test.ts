import { describe, expect, it } from 'vitest';
import { evaluate, parsePolicy, parseReport, type LicenseReport, type Policy } from './check-licenses.js';

// The contract is specs/007-open-source-hygiene/contracts/license-check.md. The report has the shape
// of `pnpm licenses list --prod --json`: license string -> the packages under it.
const policy: Policy = {
  allowed: ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD'],
  exceptions: {},
};

function reportOf(license: string, name = 'some-package', versions = ['1.0.0']): LicenseReport {
  return { [license]: [{ name, versions }] };
}

describe('evaluate', () => {
  it('passes a package under an allowed license', () => {
    expect(evaluate(reportOf('MIT'), policy)).toEqual([]);
  });

  it('flags a package under a license that is not on the list', () => {
    expect(evaluate(reportOf('GPL-3.0-only', 'copyleft', ['2.1.0']), policy)).toEqual([
      'copyleft@2.1.0: license "GPL-3.0-only" is not on the allowed list',
    ]);
  });

  it('passes an OR expression when any alternative is allowed', () => {
    expect(evaluate(reportOf('(MIT OR GPL-3.0-only)'), policy)).toEqual([]);
    expect(evaluate(reportOf('GPL-3.0-only OR MIT'), policy)).toEqual([]);
  });

  it('flags an OR expression when no alternative is allowed', () => {
    expect(evaluate(reportOf('GPL-2.0 OR LGPL-3.0'), policy)).toHaveLength(1);
  });

  it('passes an AND expression only when every term is allowed', () => {
    expect(evaluate(reportOf('MIT AND ISC'), policy)).toEqual([]);
    expect(evaluate(reportOf('MIT AND CC-BY-4.0'), policy)).toHaveLength(1);
  });

  it('handles an AND inside an OR', () => {
    expect(evaluate(reportOf('(GPL-3.0-only OR (MIT AND ISC))'), policy)).toEqual([]);
    expect(evaluate(reportOf('(GPL-3.0-only OR (MIT AND CC-BY-4.0))'), policy)).toHaveLength(1);
  });

  it.each(['Unknown', '', 'UNLICENSED', 'SEE LICENSE IN LICENSE.txt', 'GPL-2.0-only WITH Classpath-exception-2.0'])(
    'flags the license text %j, because it cannot be shown to be allowed',
    (license) => {
      expect(evaluate(reportOf(license), policy)).toHaveLength(1);
    },
  );

  it('matches license ids case-sensitively', () => {
    expect(evaluate(reportOf('mit'), policy)).toHaveLength(1);
  });

  it('lists every version of a flagged package on one line', () => {
    expect(evaluate(reportOf('GPL-3.0-only', 'multi', ['1.0.0', '2.0.0']), policy)).toEqual([
      'multi@1.0.0,2.0.0: license "GPL-3.0-only" is not on the allowed list',
    ]);
  });

  it('passes an excepted package whatever its license says', () => {
    const withException: Policy = { ...policy, exceptions: { 'odd-package': 'LICENSE file verified as MIT by hand' } };
    expect(evaluate(reportOf('Unknown', 'odd-package'), withException)).toEqual([]);
  });

  it('flags an exception that matches no shipped package', () => {
    const withException: Policy = { ...policy, exceptions: { gone: 'was verified by hand' } };
    expect(evaluate(reportOf('MIT'), withException)).toEqual([
      'exception for "gone" in scripts/license-policy.json matches no shipped package; remove it',
    ]);
  });

  it('does not treat an inherited property name as an exception', () => {
    expect(evaluate(reportOf('GPL-3.0-only', 'toString'), policy)).toHaveLength(1);
  });

  it('passes an empty report', () => {
    expect(evaluate({}, policy)).toEqual([]);
  });

  it('sorts violations by package name', () => {
    const report: LicenseReport = {
      'GPL-3.0-only': [
        { name: 'zeta', versions: ['1.0.0'] },
        { name: 'alpha', versions: ['1.0.0'] },
      ],
      Unknown: [{ name: 'middle', versions: ['1.0.0'] }],
    };
    expect(evaluate(report, policy).map((line) => line.split('@')[0])).toEqual(['alpha', 'middle', 'zeta']);
  });
});

describe('parsePolicy', () => {
  const valid = { allowed: ['MIT'], exceptions: {} };

  it('accepts a valid policy', () => {
    expect(parsePolicy(valid)).toEqual(valid);
  });

  it('accepts a policy whose exception has a reason', () => {
    expect(parsePolicy({ allowed: ['MIT'], exceptions: { pkg: 'verified by hand' } })).toEqual({
      allowed: ['MIT'],
      exceptions: { pkg: 'verified by hand' },
    });
  });

  it.each([
    ['is not an object', 'nope'],
    ['is null', null],
    ['has no allowed list', { exceptions: {} }],
    ['has no exceptions field', { allowed: ['MIT'] }],
    ['has an empty allowed list', { allowed: [], exceptions: {} }],
    ['lists an id twice', { allowed: ['MIT', 'MIT'], exceptions: {} }],
    ['has a non-string id', { allowed: ['MIT', 7], exceptions: {} }],
    ['has an extra field', { allowed: ['MIT'], exceptions: {}, extra: true }],
    ['has an empty exception reason', { allowed: ['MIT'], exceptions: { pkg: '' } }],
    ['has a non-string exception reason', { allowed: ['MIT'], exceptions: { pkg: 1 } }],
  ])('throws when the policy %s', (_name, input) => {
    expect(() => parsePolicy(input)).toThrow();
  });
});

describe('parseReport', () => {
  it('accepts the shape of pnpm licenses list --json', () => {
    const report = { MIT: [{ name: 'a', versions: ['1.0.0'], license: 'MIT', paths: ['/x'] }] };
    expect(parseReport(report)).toEqual({ MIT: [{ name: 'a', versions: ['1.0.0'] }] });
  });

  it('keeps a license group named __proto__ instead of dropping its packages', () => {
    const report = parseReport(JSON.parse('{"__proto__": [{"name": "sneaky", "versions": ["1.0.0"]}]}'));
    expect(evaluate(report, policy)).toEqual(['sneaky@1.0.0: license "__proto__" is not on the allowed list']);
  });

  it.each([
    ['is not an object', 'nope'],
    ['is an array', []],
    ['has a license whose value is not an array', { MIT: 'a' }],
    ['has a package without a name', { MIT: [{ versions: ['1.0.0'] }] }],
    ['has a package without versions', { MIT: [{ name: 'a' }] }],
  ])('throws when the report %s', (_name, input) => {
    expect(() => parseReport(input)).toThrow();
  });
});
