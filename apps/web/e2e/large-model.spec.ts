import { apiToken, createTestAccount, expect, test } from './fixtures.js';

// SC-004: a threat model of 1,000 threats and 2,000 mitigations is shown, and responds to input, within
// 3 seconds. It is seeded through the API; only the page load is timed. This is a regression guard on a
// shared runner. The authoritative measurement runs the same spec against `docker compose`:
// PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e large-model

const THREATS = 1000;
const CONCURRENCY = 20;

async function post(baseURL: string, token: string, path: string, body: unknown): Promise<{ id: string }> {
  const res = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`Seeding ${path} failed with status ${res.status}`);
  return (await res.json()) as { id: string };
}

// Runs the jobs with a bounded number in flight at once.
async function pool<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    }),
  );
}

test('opens a threat model of 1,000 threats and 2,000 mitigations within 3 seconds', async ({ page, baseURL }) => {
  // Seeding is not timed, and takes far longer than Playwright's 30 s default.
  test.setTimeout(240_000);
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const stamp = Date.now();
  const project = await post(base, token, '/api/v1/projects', { name: `m6-large-${stamp}`, description: '' });
  try {
    const model = await post(base, token, '/api/v1/threat-models', { project_id: project.id, name: 'Large model' });
    const threatIds: string[] = [];
    await pool(Array.from({ length: THREATS }, (_, i) => i), async (i) => {
      const created = await post(base, token, '/api/v1/threats', {
        threat_model_id: model.id,
        category: 'Tampering',
        title: `Threat ${i}`,
        likelihood: 'Medium',
        impact: 'High',
        origin: 'manual',
      });
      threatIds.push(created.id);
    });
    await pool(
      threatIds.flatMap((id) => [id, id]),
      async (threatId) => {
        await post(base, token, '/api/v1/mitigations', { threat_id: threatId, description: `Mitigation for ${threatId}` });
      },
    );

    const account = await createTestAccount(base);
    await page.goto('/login');
    await page.getByLabel('Username').fill(account.username);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/projects$/);

    const started = Date.now();
    await page.goto(`/threat-models/${model.id}`);
    // The list shows its first 100 rows and says how many there are; the rest are a page away (Phase 2 M4).
    await expect(page.locator('tbody tr')).toHaveCount(100, { timeout: 30_000 });
    await expect(page.getByText(`Showing ${THREATS} of ${THREATS} threats`)).toBeVisible();
    await expect(page.getByText(`Page 1 of ${THREATS / 100}`)).toBeVisible();
    // Responsive: expanding a row shows its two mitigations.
    await page.getByRole('button', { name: '2 mitigations' }).first().click();
    await expect(page.locator('tbody tr[id^="mitigations-"] li')).toHaveCount(2);
    const elapsed = Date.now() - started;

    // Printed so the measured time can be recorded, not just compared.
    console.log(`large model: ${THREATS} threats and ${THREATS * 2} mitigations opened in ${elapsed} ms`);
    expect(elapsed, `opened in ${elapsed} ms`).toBeLessThanOrEqual(3000);
  } finally {
    await fetch(`${base}/api/v1/projects/${project.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
});
