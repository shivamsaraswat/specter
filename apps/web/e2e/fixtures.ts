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

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const watch = await watchPage(page, new URL(baseURL ?? 'http://localhost').origin);
    await use(page);
    watch.assertClean();
  },
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
