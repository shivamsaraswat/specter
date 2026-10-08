import type { z } from 'zod';
import { crossRuleIssues, registryIssues, type SourcedRule } from './checks.js';
import { LibraryLoadError, type LoadIssue } from './errors.js';
import { coverageOf, createLibrary, type Library } from './library.js';
import {
  RegistryFileSchema,
  RetiredFileSchema,
  RuleFileSchema,
  type RetirementRecord,
  type Rule,
} from './rule-schema.js';
import { RULE_ELEMENT_TYPES, type RuleElementType } from './stride.js';
import { parseYamlFile } from './yaml.js';

// One file of the rules directory, read into memory. `path` is relative to the rules directory and
// uses '/' (for example 'process/p-x.yaml').
export interface RuleSourceFile {
  path: string;
  text: string;
}

export interface ParseOptions {
  // Report any STRIDE-per-element cell with no active rule. Off by default so a test can load a few
  // rules; loadLibrary turns it on.
  requireCoverage?: boolean;
}

type Classified =
  | { kind: 'rule'; directory: RuleElementType; name: string }
  | { kind: 'ids' }
  | { kind: 'retired' }
  | { kind: 'stray'; message: string };

const RULE_DIRECTORIES: readonly string[] = RULE_ELEMENT_TYPES;

function classify(path: string): Classified {
  if (path === 'ids.yaml') return { kind: 'ids' };
  if (path === 'retired.yaml') return { kind: 'retired' };
  const parts = path.split('/');
  if (parts.length === 1) {
    return {
      kind: 'stray',
      message: 'unexpected file: only ids.yaml and retired.yaml belong at the top level',
    };
  }
  const [directory, ...rest] = parts as [string, ...string[]];
  if (!RULE_DIRECTORIES.includes(directory)) {
    return {
      kind: 'stray',
      message: `unknown directory "${directory}": rules are grouped by element type (${RULE_ELEMENT_TYPES.join(', ')})`,
    };
  }
  if (rest.length > 1)
    return {
      kind: 'stray',
      message:
        'nested directories are not allowed: put the rule directly in its element type directory',
    };
  const file = rest[0] as string;
  if (!file.endsWith('.yaml')) {
    return { kind: 'stray', message: `unexpected file: rule files end in .yaml` };
  }
  return {
    kind: 'rule',
    directory: directory as RuleElementType,
    name: file.slice(0, -'.yaml'.length),
  };
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`,
    )
    .join('');
}

function describe(issue: z.core.$ZodIssue): string {
  const path = formatPath(issue.path);
  const message = issue.message.endsWith('received undefined') ? 'is required' : issue.message;
  return path === '' ? message : `${path}: ${message}`;
}

function toIssues(
  file: string,
  error: z.ZodError,
  ruleFor: (path: readonly PropertyKey[]) => string | null,
): LoadIssue[] {
  return error.issues.map((issue) => ({
    file,
    rule: ruleFor(issue.path),
    message: describe(issue),
  }));
}

const ID_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRuleFile(
  file: RuleSourceFile,
  directory: RuleElementType,
  name: string,
  issues: LoadIssue[],
): Rule | undefined {
  const parsed = parseYamlFile(file.path, file.text, name);
  if ('issues' in parsed) {
    issues.push(...parsed.issues);
    return undefined;
  }
  // The rule is labelled by its id when that can be read, otherwise by its file name, which the checks
  // below require to equal the id.
  const rawId = isRecord(parsed.value) ? parsed.value['id'] : undefined;
  const label = typeof rawId === 'string' && ID_FORMAT.test(rawId) ? rawId : name;
  const result = RuleFileSchema.safeParse(parsed.value);
  if (!result.success) {
    issues.push(...toIssues(file.path, result.error, () => label));
    return undefined;
  }
  const rule = result.data;
  const before = issues.length;
  if (rule.id !== name) {
    issues.push({
      file: file.path,
      rule: rule.id,
      message: `id: the file must be named ${rule.id}.yaml`,
    });
  }
  if (rule.element_type !== directory) {
    issues.push({
      file: file.path,
      rule: rule.id,
      message: `element_type: the rule is for ${rule.element_type} but sits in the ${directory} directory`,
    });
  }
  return issues.length === before ? rule : undefined;
}

// Every entry names the id at fault, or null when the problem is with the whole file.
function readRetired(file: RuleSourceFile, issues: LoadIssue[]): RetirementRecord[] | undefined {
  const parsed = parseYamlFile(file.path, file.text, null);
  if ('issues' in parsed) {
    issues.push(...parsed.issues);
    return undefined;
  }
  const result = RetiredFileSchema.safeParse(parsed.value);
  if (result.success) return result.data;
  const raw = isRecord(parsed.value) ? parsed.value['retired'] : undefined;
  issues.push(
    ...toIssues(file.path, result.error, (path) => {
      const index = path[0] === 'retired' ? path[1] : undefined;
      const entry =
        typeof index === 'number' && Array.isArray(raw) ? (raw[index] as unknown) : undefined;
      const id = isRecord(entry) ? entry['id'] : undefined;
      return typeof id === 'string' ? id : null;
    }),
  );
  return undefined;
}

function readRegistry(file: RuleSourceFile, issues: LoadIssue[]): string[] | undefined {
  const parsed = parseYamlFile(file.path, file.text, null);
  if ('issues' in parsed) {
    issues.push(...parsed.issues);
    return undefined;
  }
  const result = RegistryFileSchema.safeParse(parsed.value);
  if (result.success) return result.data;
  const raw = isRecord(parsed.value) ? parsed.value['ids'] : undefined;
  issues.push(
    ...toIssues(file.path, result.error, (path) => {
      const index = path[0] === 'ids' ? path[1] : undefined;
      const entry =
        typeof index === 'number' && Array.isArray(raw) ? (raw[index] as unknown) : undefined;
      return typeof entry === 'string' ? entry : null;
    }),
  );
  return undefined;
}

// Builds the library from rule files held in memory. It either returns a whole library or throws a
// LibraryLoadError listing every problem; it never skips a bad rule and carries on (FR-013).
export function parseLibrary(
  files: readonly RuleSourceFile[],
  options: ParseOptions = {},
): Library {
  const issues: LoadIssue[] = [];
  const rules: SourcedRule[] = [];
  let retired: RetirementRecord[] = [];
  let registry: string[] | undefined;
  let sawIds = false;
  let sawRetired = false;

  for (const file of files) {
    const kind = classify(file.path);
    if (kind.kind === 'stray') {
      issues.push({ file: file.path, rule: null, message: kind.message });
    } else if (kind.kind === 'ids') {
      sawIds = true;
      registry = readRegistry(file, issues);
    } else if (kind.kind === 'retired') {
      sawRetired = true;
      retired = readRetired(file, issues) ?? retired;
    } else {
      const rule = readRuleFile(file, kind.directory, kind.name, issues);
      if (rule) rules.push({ file: file.path, rule });
    }
  }
  if (!sawIds)
    issues.push({
      file: 'ids.yaml',
      rule: null,
      message: 'missing: it lists every rule id ever issued (start with `ids: []`)',
    });
  if (!sawRetired)
    issues.push({
      file: 'retired.yaml',
      rule: null,
      message: 'missing: it holds the retirement records (start with `retired: []`)',
    });

  // Stage 3 compares rules with each other, so it runs on the ones whose own files were fine.
  const filesWereFine = issues.length === 0;
  issues.push(...crossRuleIssues(rules, retired));
  if (registry)
    issues.push(...registryIssues(rules, retired, registry, { judgeVanished: filesWereFine }));

  // A rule missing because its file failed would show up here as a hole, so coverage is only judged
  // when every file was fine.
  if (options.requireCoverage === true && issues.length === 0) {
    for (const row of coverageOf(rules.map((source) => source.rule))) {
      if (row.active_rules === 0) {
        issues.push({
          file: 'rules',
          rule: null,
          message: `no active rule for ${row.element_type} / ${row.category}: STRIDE-per-element allows it, so the catalog needs at least one`,
        });
      }
    }
  }

  if (issues.length > 0) throw new LibraryLoadError(issues);
  return createLibrary(
    rules.map((source) => source.rule),
    retired,
  );
}
