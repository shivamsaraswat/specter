import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { addNode, canvasOf, connect, deleteFromList, dragBy, nodeOf, untilSaved, untilStill } from './diagram-helpers.js';
import { apiRequest, apiToken, expect, seedElements, seedModel, signInAsNewAccount, test } from './fixtures.js';

// US7, spec FR-024 to FR-024d, SC-010: twenty varied changes are taken back one at a time, and put back one
// at a time, and the diagram on the server is the same as before at both ends. What is compared is read
// through the API, not from the screen.

test.use({ viewport: { width: 1400, height: 1100 } });

const STEPS = 20;

// A model with a boundary and four elements, opened in the editor. `snapshot` is what the server holds,
// without the times it was written, in a fixed order.
async function open(page: Page, base: string) {
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'undo');
  const id = { vpc: randomUUID(), web: randomUUID(), api: randomUUID(), store: randomUUID(), partner: randomUUID() };
  await seedElements(base, token, modelId, [
    { op: 'create', element: { id: id.vpc, type: 'trust_boundary', name: 'VPC', layout: { x: 0, y: 0, width: 520, height: 380 } } },
    { op: 'create', element: { id: id.web, type: 'process', name: 'Web', layout: { x: 900, y: 40 } } },
    { op: 'create', element: { id: id.api, type: 'process', name: 'API', layout: { x: 900, y: 160 } } },
    { op: 'create', element: { id: id.store, type: 'data_store', name: 'Store', layout: { x: 900, y: 300 } } },
    { op: 'create', element: { id: id.partner, type: 'external_entity', name: 'Partner', layout: { x: 900, y: 440 } } },
    { op: 'create', element: { type: 'data_flow', name: 'Reads', source_element_id: id.api, target_element_id: id.store } },
    { op: 'create', element: { type: 'data_flow', name: 'Calls', source_element_id: id.api, target_element_id: id.partner } },
  ]);
  const snapshot = async () =>
    ((await apiRequest(base, token, 'GET', `/api/v1/threat-models/${modelId}/elements`)).body as Record<string, unknown>[])
      .map(({ created_at: _created, updated_at: _updated, ...rest }) => rest)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const start = await snapshot();

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}/diagram`);
  await untilStill(nodeOf(page, 'Partner'));
  return { id, snapshot, start };
}

// Twenty changes, each one step in the history: 1-4 two new nodes, 5-6 a flow between them and its name, 7 a
// node moved, 8 a boundary moved, 9-10 a new boundary and its name, 11 a flag, 12 a tag, 13 a type change, 14 a
// node put into a boundary, 15-16 nodes deleted with their flows, 17 a flow deleted with the key, 18 a boundary
// deleted, 19-20 two renames.
async function twentyChanges(page: Page): Promise<void> {
  const panel = page.getByRole('complementary', { name: 'Properties' });
  const dialog = page.getByRole('dialog');
  const select = async (name: string) => {
    await canvasOf(page).scrollIntoViewIfNeeded();
    await nodeOf(page, name).locator('.diagram-node__label, .diagram-boundary__label').click();
    await expect(page.getByLabel('Name')).toHaveValue(name);
  };
  const rename = async (to: string) => {
    await page.getByLabel('Name').fill(to);
    await page.keyboard.press('Enter');
    await expect(nodeOf(page, to)).toBeVisible();
  };
  const deleteSelected = async (confirm: boolean) => {
    await panel.getByRole('button', { name: 'Delete element' }).click();
    if (confirm) await dialog.getByRole('button', { name: 'Delete' }).click();
  };

  await addNode(page, 'Add process', 'Worker');
  await addNode(page, 'Add data store', 'Cache');
  await connect(page, 'Worker', 'Cache', 'Sync');
  await dragBy(page, nodeOf(page, 'Worker'), 40, 70);
  await dragBy(page, nodeOf(page, 'VPC'), 30, 30);
  await addNode(page, 'Add trust boundary', 'Zone');
  await select('API');
  await panel.getByRole('radiogroup', { name: 'Runs privileged' }).getByRole('radio', { name: 'Yes', exact: true }).check();
  await panel.getByLabel('Add a technology tag').fill('Node 22');
  await panel.getByRole('button', { name: 'Add tag' }).click();
  await expect(panel.getByText('Node 22')).toBeVisible();
  await select('Web');
  await panel.getByLabel('Type').selectOption('external_entity');
  await expect(panel.getByLabel('Type')).toHaveValue('external_entity');
  await panel.getByLabel('Trust boundary', { exact: true }).selectOption({ label: 'VPC' });
  await select('Store');
  await deleteSelected(true);
  await expect(nodeOf(page, 'Store')).toBeHidden();
  await select('Partner');
  await deleteSelected(true);
  await expect(nodeOf(page, 'Partner')).toBeHidden();
  await deleteFromList(page, 'Data flow: Sync', 'Sync');
  await select('VPC');
  await deleteSelected(false);
  await expect(nodeOf(page, 'VPC')).toBeHidden();
  await select('Worker');
  await rename('Runner');
  await select('Cache');
  await rename('Memo');
}

// Each button is pressed once per step, and is disabled exactly when no step is left.
async function press(page: Page, name: 'Undo' | 'Redo'): Promise<void> {
  const button = page.getByRole('button', { name, exact: true });
  for (let i = 0; i < STEPS; i += 1) await button.click();
  await expect(button).toBeDisabled();
}

test('undoes twenty varied changes, and after a reload the diagram is the one it started as', async ({ page, baseURL }) => {
  const { id, snapshot, start } = await open(page, baseURL ?? '');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();

  await twentyChanges(page);
  await untilSaved(page);
  expect(await snapshot()).not.toEqual(start);

  await press(page, 'Undo');
  await expect.poll(snapshot).toEqual(start);
  await untilSaved(page);
  // What was deleted is back with the ids it had.
  const ids = new Set((await snapshot()).map((e) => e.id));
  for (const kept of [id.vpc, id.store, id.partner]) expect(ids.has(kept)).toBe(true);

  await page.reload();
  await untilStill(nodeOf(page, 'Partner'));
  for (const name of ['VPC', 'Web', 'API', 'Store', 'Partner']) await expect(nodeOf(page, name)).toBeVisible();
  for (const name of ['Runner', 'Memo', 'Zone']) await expect(nodeOf(page, name)).toHaveCount(0);
  expect(await snapshot()).toEqual(start);
});

test('redoes all twenty after undoing them, and after a reload the diagram is the one that was edited', async ({ page, baseURL }) => {
  const { id, snapshot, start } = await open(page, baseURL ?? '');
  await twentyChanges(page);
  await untilSaved(page);
  const edited = await snapshot();

  await press(page, 'Undo');
  await expect.poll(snapshot).toEqual(start);
  await untilSaved(page);

  await press(page, 'Redo');
  await expect.poll(snapshot).toEqual(edited);
  await untilSaved(page);
  // What was added is back with the ids it had, and what was deleted is gone again.
  const ids = new Set(edited.map((e) => e.id));
  expect(ids.has(id.store) || ids.has(id.partner) || ids.has(id.vpc)).toBe(false);

  await page.reload();
  await untilStill(nodeOf(page, 'Memo'));
  for (const name of ['Runner', 'Memo', 'Zone', 'Web', 'API']) await expect(nodeOf(page, name)).toBeVisible();
  for (const name of ['VPC', 'Store', 'Partner']) await expect(nodeOf(page, name)).toHaveCount(0);
  expect(await snapshot()).toEqual(edited);
});
