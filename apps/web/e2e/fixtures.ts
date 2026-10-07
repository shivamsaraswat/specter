import { randomUUID } from 'node:crypto';
import { expect, test as base, type Page } from '@playwright/test';

// Every spec watches its pages for two things the spec forbids: a Content-Security-Policy violation
// (SC-003) and a request to any origin other than the app's own (SC-008).
export interface PageWatch {
  assertClean: () => void;
}

export async function watchPage(page: Page, origin: string): Promise<PageWatch> {
  const violations: string[] = [];
  const foreign: string[] = [];
  await page.exposeFunction('__reportCspViolation', (detail: string) => {
    violations.push(detail);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __reportCspViolation: (detail: string) => void }).__reportCspViolation;
      report(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== origin) foreign.push(request.url());
  });
  return {
    assertClean: () => {
      expect(violations, 'CSP violations').toEqual([]);
      expect(foreign, 'requests to another origin').toEqual([]);
    },
  };
}

// Projects a test made through seedModel, deleted when the test is over so the shared dev database does not
// fill up with them (a project list that grows with every run slows every page that shows it). A worker runs
// one test at a time, so a list here belongs to the test that is running.
const madeByTest: { base: string; token: string; projectId: string }[] = [];

export const test = base.extend<{ cleanUp: void }>({
  page: async ({ page, baseURL }, use) => {
    const watch = await watchPage(page, new URL(baseURL ?? 'http://localhost').origin);
    await use(page);
    watch.assertClean();
  },
  cleanUp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      for (const { base: origin, token, projectId } of madeByTest.splice(0)) {
        await apiRequest(origin, token, 'DELETE', `/api/v1/projects/${projectId}`).catch(() => undefined);
      }
    },
    { auto: true },
  ],
});

export { expect };

export interface TestAccount {
  username: string;
  password: string;
}

const ADMIN = { username: process.env.ADMIN_USERNAME ?? 'admin', password: process.env.ADMIN_PASSWORD ?? 'admin' };

// A bearer token from the unchanged /api/login, for seeding data and creating accounts.
export async function apiToken(baseURL: string, account: TestAccount = ADMIN): Promise<string> {
  const res = await fetch(`${baseURL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  });
  if (res.status !== 200) throw new Error(`Test login failed with status ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

// Each test signs in as its own account (named m6-test-*, which the API test run's teardown removes),
// because a test that logs out or ends sessions must never end another test's session.
export async function createTestAccount(baseURL: string): Promise<TestAccount> {
  const token = await apiToken(baseURL);
  const username = `m6-test-${randomUUID()}`;
  const password = `pw-${randomUUID()}`.slice(0, 40);
  const res = await fetch(`${baseURL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 201) throw new Error(`Could not create a test account: status ${res.status}`);
  return { username, password };
}

// ---- Phase 2 / Milestone 1: seeding diagrams through the API ----

export async function apiRequest(
  baseURL: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseURL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
}

async function create(baseURL: string, token: string, path: string, body: unknown): Promise<{ id: string }> {
  const res = await apiRequest(baseURL, token, 'POST', path, body);
  if (res.status !== 201) throw new Error(`Seeding ${path} failed with status ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

// A new project with one threat model, named so a leftover can be told from real data.
export async function seedModel(baseURL: string, token: string, label: string): Promise<{ projectId: string; modelId: string }> {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const project = await create(baseURL, token, '/api/v1/projects', { name: `m-p2-${label}-${stamp}`, description: '' });
  const model = await create(baseURL, token, '/api/v1/threat-models', { project_id: project.id, name: `${label} ${stamp}` });
  madeByTest.push({ base: baseURL, token, projectId: project.id });
  return { projectId: project.id, modelId: model.id };
}

export interface SeededElement {
  id: string;
  name: string;
  type: string;
}

// Writes elements through the batch endpoint, at most 200 per request. Each `create` should carry its
// own `id` so a later operation (a flow, a member) can refer to it.
export async function seedElements(
  baseURL: string,
  token: string,
  modelId: string,
  operations: unknown[],
): Promise<SeededElement[]> {
  const seeded: SeededElement[] = [];
  for (let i = 0; i < operations.length; i += 200) {
    const res = await apiRequest(baseURL, token, 'POST', `/api/v1/threat-models/${modelId}/elements/batch`, {
      operations: operations.slice(i, i + 200),
    });
    if (res.status !== 200) throw new Error(`Seeding elements failed with status ${res.status}: ${JSON.stringify(res.body)}`);
    seeded.push(...(res.body as { elements: SeededElement[] }).elements);
  }
  return seeded;
}

// Signs the page in as a fresh account of its own, so ending sessions can never affect another test.
export async function signInAsNewAccount(page: Page, baseURL: string): Promise<TestAccount> {
  const account = await createTestAccount(baseURL);
  await page.goto('/login');
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  return account;
}
