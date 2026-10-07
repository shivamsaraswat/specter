import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fails when a shipped (production) dependency has a license that is not on the allowed list
// (Phase 1 Milestone 7, FR-006a). The contract is
// specs/phase-1/milestone-7-open-source-hygiene/contracts/license-check.md. It is default-deny: anything this file
// cannot positively show to be allowed is a violation.

export interface Policy {
  allowed: string[];
  exceptions: Record<string, string>;
}

// The shape of `pnpm licenses list --prod --json`: each license string maps to the packages under it.
export type LicenseReport = Record<string, { name: string; versions: string[] }[]>;

const POLICY_PATH = 'scripts/license-policy.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parsePolicy(input: unknown): Policy {
  if (!isRecord(input)) throw new Error(`${POLICY_PATH} must be a JSON object`);
  for (const key of Object.keys(input)) {
    if (key !== 'allowed' && key !== 'exceptions') throw new Error(`${POLICY_PATH} has an unknown field "${key}"`);
  }
  const { allowed, exceptions } = input;
  if (!isStringArray(allowed) || allowed.length === 0) {
    throw new Error(`${POLICY_PATH}: "allowed" must be a non-empty array of license ids`);
  }
  if (new Set(allowed).size !== allowed.length) throw new Error(`${POLICY_PATH}: "allowed" lists an id twice`);
  if (!isRecord(exceptions)) throw new Error(`${POLICY_PATH}: "exceptions" must be an object`);
  // Object.fromEntries defines own properties, so a name like "__proto__" cannot change the prototype.
  const reasons = Object.fromEntries(
    Object.entries(exceptions).map(([name, reason]): [string, string] => {
      if (typeof reason !== 'string' || reason.trim() === '') {
        throw new Error(`${POLICY_PATH}: the exception for "${name}" needs a non-empty reason`);
      }
      return [name, reason];
    }),
  );
  return { allowed, exceptions: reasons };
}

export function parseReport(input: unknown): LicenseReport {
  if (!isRecord(input)) throw new Error('the license report is not an object');
  // Object.fromEntries defines own properties, so a license string like "__proto__" cannot hide a
  // package by changing the prototype instead of adding an entry.
  return Object.fromEntries(
    Object.entries(input).map(([license, packages]): [string, { name: string; versions: string[] }[]] => {
      if (!Array.isArray(packages)) throw new Error('the license report has an entry that is not a list');
      return [
        license,
        packages.map((entry: unknown) => {
          if (!isRecord(entry) || typeof entry.name !== 'string' || !isStringArray(entry.versions)) {
            throw new Error('the license report has a package without a name or versions');
          }
          return { name: entry.name, versions: entry.versions };
        }),
      ];
    }),
  );
}

// An SPDX expression: ids joined by AND (binds tighter) and OR, with parentheses. It is evaluated to
// "allowed or not" directly. Anything that does not parse, such as `WITH` exceptions, free text or an
// empty string, throws, and the caller treats that as not allowed.
function isExpressionAllowed(license: string, allowed: ReadonlySet<string>): boolean {
  const tokens = license.match(/[()]|[^\s()]+/g) ?? [];
  let position = 0;

  const peek = (): string | undefined => tokens[position];
  const take = (): string => {
    const token = tokens[position];
    if (token === undefined) throw new Error('unexpected end of license expression');
    position += 1;
    return token;
  };

  function parseFactor(): boolean {
    const token = take();
    if (token === '(') {
      const inner = parseOr();
      if (take() !== ')') throw new Error('unbalanced parenthesis');
      return inner;
    }
    if (token === ')' || token === 'AND' || token === 'OR') throw new Error('unexpected token');
    return allowed.has(token);
  }

  function parseAnd(): boolean {
    let result = parseFactor();
    while (peek() === 'AND') {
      take();
      // Always parse the right side, so a syntax error is never hidden by a short circuit.
      result = parseFactor() && result;
    }
    return result;
  }

  function parseOr(): boolean {
    let result = parseAnd();
    while (peek() === 'OR') {
      take();
      result = parseAnd() || result;
    }
    return result;
  }

  const result = parseOr();
  if (position !== tokens.length) throw new Error('unexpected trailing text');
  return result;
}

function isAllowed(license: string, allowed: ReadonlySet<string>): boolean {
  try {
    return isExpressionAllowed(license, allowed);
  } catch {
    return false;
  }
}

// Returns one line per violation, sorted by package name. An empty list means the check passes.
export function evaluate(report: LicenseReport, policy: Policy): string[] {
  const allowed = new Set(policy.allowed);
  const shipped = new Set<string>();
  const violations: { name: string; line: string }[] = [];

  for (const [license, packages] of Object.entries(report)) {
    for (const { name, versions } of packages) {
      shipped.add(name);
      if (Object.hasOwn(policy.exceptions, name) || isAllowed(license, allowed)) continue;
      violations.push({
        name,
        line: `${name}@${versions.join(',')}: license "${license}" is not on the allowed list`,
      });
    }
  }
  for (const name of Object.keys(policy.exceptions)) {
    if (shipped.has(name)) continue;
    violations.push({
      name,
      line: `exception for "${name}" in ${POLICY_PATH} matches no shipped package; remove it`,
    });
  }

  const byName = (a: { name: string; line: string }, b: { name: string; line: string }): number =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.line < b.line ? -1 : a.line > b.line ? 1 : 0;
  return violations.sort(byName).map(({ line }) => line);
}

function countPackages(report: LicenseReport): number {
  return new Set(Object.values(report).flatMap((packages) => packages.map(({ name }) => name))).size;
}

// Error messages here never include a path, an environment variable or the tool's own output.
function loadPolicy(root: string): Policy {
  let text: string;
  try {
    text = readFileSync(path.join(root, POLICY_PATH), 'utf8');
  } catch {
    throw new Error(`${POLICY_PATH} is missing or unreadable`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${POLICY_PATH} is not valid JSON`);
  }
  return parsePolicy(json);
}

function loadReport(root: string): LicenseReport {
  let output: string;
  try {
    // A fixed argument vector and no shell: nothing is interpolated into the command.
    output = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('"pnpm licenses list --prod --json" failed');
  }
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch {
    throw new Error('"pnpm licenses list --prod --json" did not print JSON');
  }
  return parseReport(json);
}

function main(): number {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let policy: Policy;
  let report: LicenseReport;
  try {
    policy = loadPolicy(root);
    report = loadReport(root);
  } catch (error) {
    console.error(`License check could not run: ${error instanceof Error ? error.message : 'unknown error'}`);
    return 2;
  }

  const violations = evaluate(report, policy);
  if (violations.length > 0) {
    for (const line of violations) console.error(line);
    console.error(
      `License check failed: ${violations.length} problem(s). To change what is allowed, edit ${POLICY_PATH}; see CONTRIBUTING.md#dependencies.`,
    );
    return 1;
  }
  console.log(`License check passed: ${countPackages(report)} shipped packages, all on the allowed list.`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
