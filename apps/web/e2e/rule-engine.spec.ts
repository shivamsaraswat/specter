import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { canvasOf } from './diagram-helpers.js';
import { apiRequest, apiToken, expect, seedElements, seedModel, signInAsNewAccount, test } from './fixtures.js';

// The canvas sits below the header, so a taller window keeps the diagram's controls on screen.
test.use({ viewport: { width: 1400, height: 1100 } });

// Phase 2 / Milestone 3 in a real browser against the built app and a real database (quickstart §2):
// draw (here: seed) a diagram, generate threats, and check what the server stored. The diagram is
// seeded through the batch endpoint, as the other diagram specs do; the action under test is the
// button.

interface StoredThreat {
  id: string;
  element_id: string;
  title: string;
  origin: string;
  library_ref: string;
  stale: unknown;
}

const generateStatus = (page: Page) => page.locator('.generate-bar [role="status"]');
const SUMMARY = /^Generated threats: (\d+) created, (\d+) already existed \(of which (\d+) no longer stale\), (\d+) newly stale\.$/;

const create = (id: string, type: string, name: string, extra: Record<string, unknown> = {}) => ({
  op: 'create',
  element: { id, type, name, ...extra },
});

const threatsOf = async (base: string, token: string, modelId: string): Promise<StoredThreat[]> =>
  (await apiRequest(base, token, 'GET', `/api/v1/threat-models/${modelId}/threats`)).body as StoredThreat[];

test('generates threats from the diagram, and they are there after a reload (US1)', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'generate');
  const [boundary, customer, api, store, places, writes] = Array.from({ length: 6 }, () => randomUUID()) as [string, string, string, string, string, string];

  // An external entity outside a boundary; a process and a data store inside it. "Places order" crosses
  // the boundary and "Writes order" does not. Every flag is left "not assessed".
  await seedElements(base, token, modelId, [
    create(boundary, 'trust_boundary', 'Internal', { layout: { x: 300, y: 40, width: 420, height: 240 } }),
    create(customer, 'external_entity', 'Customer', { layout: { x: 20, y: 100 } }),
    create(api, 'process', 'Orders API', { parent_boundary_id: boundary, layout: { x: 40, y: 60 } }),
    create(store, 'data_store', 'Orders DB', { parent_boundary_id: boundary, layout: { x: 240, y: 60 } }),
    create(places, 'data_flow', 'Places order', { source_element_id: customer, target_element_id: api }),
    create(writes, 'data_flow', 'Writes order', { source_element_id: api, target_element_id: store }),
  ]);

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}`);
  await page.getByRole('button', { name: 'Generate threats' }).click();

  await expect(generateStatus(page)).toHaveText(SUMMARY);
  const created = Number(SUMMARY.exec((await generateStatus(page).textContent()) ?? '')?.[1]);
  expect(created).toBeGreaterThan(0);

  // What the server stored, after a reload.
  await page.reload();
  const threats = await threatsOf(base, token, modelId);
  expect(threats).toHaveLength(created);
  expect(threats.every((t) => t.origin === 'rule' && t.stale === null)).toBe(true);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(created + 1);

  // The flow that crosses the boundary has a threat the one that does not lacks (US1 scenario 3).
  const refs = (id: string) => new Set(threats.filter((t) => t.element_id === id).map((t) => t.library_ref));
  expect([...refs(places)].filter((ref) => !refs(writes).has(ref)).length).toBeGreaterThan(0);
});

test('a 50-element diagram shows its summary within 5 seconds of the click (SC-006)', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'generate-50');
  const entities = Array.from({ length: 16 }, () => randomUUID());
  const processes = Array.from({ length: 16 }, () => randomUUID());
  const stores = Array.from({ length: 16 }, () => randomUUID());
  const boundary = randomUUID();
  await seedElements(base, token, modelId, [
    create(boundary, 'trust_boundary', 'Zone'),
    ...entities.map((id, i) => create(id, 'external_entity', `Entity ${i}`)),
    ...processes.map((id, i) => create(id, 'process', `Process ${i}`, { parent_boundary_id: boundary })),
    ...stores.map((id, i) => create(id, 'data_store', `Store ${i}`, { parent_boundary_id: boundary })),
    create(randomUUID(), 'data_flow', 'Flow', { source_element_id: entities[0], target_element_id: processes[0] }),
  ]);

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}`);
  const button = page.getByRole('button', { name: 'Generate threats' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(generateStatus(page)).toHaveText(SUMMARY, { timeout: 5000 });
});

test('a second run changes nothing, keeps the user’s edits, and brings back a deleted threat (US2)', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'rerun');
  await seedElements(base, token, modelId, [create(randomUUID(), 'process', 'Orders API', { layout: { x: 40, y: 60 } })]);

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}`);
  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(SUMMARY);
  const total = Number(SUMMARY.exec((await generateStatus(page).textContent()) ?? '')?.[1]);
  expect(total).toBeGreaterThan(1);

  // The user edits a generated threat: its title, its risk inputs and its status.
  const [target] = await threatsOf(base, token, modelId);
  if (!target) throw new Error('nothing was generated');
  const edited = await apiRequest(base, token, 'PATCH', `/api/v1/threats/${target.id}`, {
    title: 'My own title',
    likelihood: 'Low',
    impact: 'Low',
    status: 'accepted',
    status_reason: 'Mine to decide',
  });
  expect(edited.status).toBe(200);

  // Step 3 and 4: the second run creates nothing and leaves the edit alone.
  await page.reload();
  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(`Generated threats: 0 created, ${total} already existed (of which 0 no longer stale), 0 newly stale.`);
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'My own title' });
  // The status is a select whose options always include "accepted", so its value is what is asserted.
  await expect(row.getByRole('combobox', { name: /^Status of / })).toHaveValue('accepted');
  await expect(row).toContainText('Mine to decide');
  expect(await threatsOf(base, token, modelId)).toHaveLength(total);

  // Step 6: deleting a generated threat warns that it will come back, and it does.
  await page.getByRole('button', { name: 'Delete threat My own title' }).click();
  const dialog = page.locator('dialog');
  await expect(dialog).toContainText('Generating threats again will create it again while its rule applies');
  await expect(dialog).toContainText('set its status to Not applicable, with a reason, instead');
  await dialog.locator('button.danger').click();
  await expect(page.getByRole('row').filter({ hasText: 'My own title' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(`Generated threats: 1 created, ${total - 1} already existed (of which 0 no longer stale), 0 newly stale.`);
  expect(await threatsOf(base, token, modelId)).toHaveLength(total);
});

test('flags a threat stale when the diagram changes, explains why, clears it when undone, and still refuses to delete an element with threats (US3)', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'stale');
  const [api, store, writes] = Array.from({ length: 3 }, () => randomUUID()) as [string, string, string];
  await seedElements(base, token, modelId, [
    create(api, 'process', 'Orders API', { layout: { x: 40, y: 60 } }),
    create(store, 'data_store', 'Orders DB', { layout: { x: 340, y: 60 } }),
    create(writes, 'data_flow', 'Writes order', { source_element_id: api, target_element_id: store }),
  ]);

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}`);
  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(SUMMARY);
  const total = (await threatsOf(base, token, modelId)).length;
  const plaintext = (await threatsOf(base, token, modelId)).filter((t) => t.element_id === writes && t.library_ref.includes('plaintext'));
  expect(plaintext.length).toBeGreaterThan(0);

  // On the Diagram tab, mark the flow "Encrypted in transit: Yes" and generate straight away: the run waits for the save.
  const flagOf = (group: string, option: 'Yes' | 'No' | 'Not assessed') =>
    page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option, exact: true });
  // Going back to the Diagram tab by its link, after a data flow was selected, crashes the canvas (an existing
  // Milestone 1 bug: React's "maximum update depth" in the edges update, reproducible without generating
  // anything). The test returns to the diagram by its address instead, which loads it fresh.
  const backToDiagram = async () => page.goto(`/threat-models/${modelId}/diagram`);
  const chooseFlow = async () => {
    const row = page.getByRole('navigation', { name: 'Elements' }).getByRole('button', { name: 'Data flow: Writes order' });
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Name')).toHaveValue('Writes order');
  };
  await page.getByRole('link', { name: 'Diagram' }).click();
  await chooseFlow();
  await flagOf('Encrypted in transit', 'Yes').check();
  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(/ \d+ newly stale\.$/);
  expect(Number(/ (\d+) newly stale\.$/.exec((await generateStatus(page).textContent()) ?? '')?.[1])).toBeGreaterThanOrEqual(plaintext.length);

  // On the Threats tab each is marked, with the reason in place, and nothing was deleted.
  await page.getByRole('link', { name: 'Threats' }).click();
  const stale = page.locator('.stale-reason');
  await expect(stale.first()).toContainText('requires Encrypted in transit to be No; it is Yes.');
  await expect(page.locator('.badge.stale')).toHaveCount(plaintext.length);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(total + 1);
  expect((await threatsOf(base, token, modelId)).filter((t) => t.stale !== null)).toHaveLength(plaintext.length);

  // Undo it: the same threats are current again, with no copies.
  await backToDiagram();
  await chooseFlow();
  await flagOf('Encrypted in transit', 'Not assessed').check();
  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(new RegExp(`^Generated threats: 0 created, ${total} already existed \\(of which ${plaintext.length} no longer stale\\), 0 newly stale\\.$`));
  await page.getByRole('link', { name: 'Threats' }).click();
  await expect(page.locator('.badge.stale')).toHaveCount(0);
  expect(await threatsOf(base, token, modelId)).toHaveLength(total);

  // An element with threats still cannot be deleted from the editor (FR-013).
  await backToDiagram();
  const row = page.getByRole('navigation', { name: 'Elements' }).getByRole('button', { name: 'Data store: Orders DB' });
  await expect(async () => {
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Name')).toHaveValue('Orders DB', { timeout: 1500 });
    // The Delete key only reaches the editor once the selection has arrived on the canvas.
    await expect(canvasOf(page).locator('.react-flow__node:focus')).toHaveCount(1, { timeout: 1500 });
    await page.keyboard.press('Delete');
    await expect(page.getByRole('heading', { name: "This element can't be deleted yet" })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000, intervals: [100, 300] });
  expect((await apiRequest(base, token, 'GET', `/api/v1/elements/${store}`)).status).toBe(200);
});

test('tells generated threats from manual ones in the list (US4)', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'source');
  const api = randomUUID();
  await seedElements(base, token, modelId, [create(api, 'process', 'Orders API', { layout: { x: 40, y: 60 } })]);
  const manual = await apiRequest(base, token, 'POST', '/api/v1/threats', {
    threat_model_id: modelId,
    category: 'Spoofing',
    title: 'Written by hand',
    likelihood: 'Low',
    impact: 'Low',
    origin: 'manual',
  });
  expect(manual.status).toBe(201);

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}`);
  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(SUMMARY);
  await page.reload();

  await expect(page.getByRole('row').filter({ hasText: 'Written by hand' }).getByRole('cell', { name: 'Manual', exact: true })).toBeVisible();
  const generated = (await threatsOf(base, token, modelId)).find((t) => t.origin === 'rule');
  if (!generated) throw new Error('nothing was generated');
  const row = page.getByRole('row').filter({ has: page.locator('code', { hasText: generated.library_ref }) });
  await expect(row.first().getByRole('cell', { name: new RegExp(`^Rule ${generated.library_ref}$`) })).toBeVisible();
});
