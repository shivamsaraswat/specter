import type { Page } from '@playwright/test';
import { stored, untilStill, canvasOf, deleteFromList, nodeOf } from './diagram-helpers.js';
import { apiToken, expect, seedModel, signInAsNewAccount, test } from './fixtures.js';

// US5, spec FR-025, FR-026, SC-006: the same diagram can be built and changed with the keyboard alone.
// Every step below is a key press on a control that already has focus. (A native <select> is set with
// selectOption: how a closed select reacts to the arrow keys is the browser's own, and differs by platform.)

test.use({ viewport: { width: 1400, height: 1100 } });

const press = (page: Page, key: string) => page.keyboard.press(key);

// Moves focus to a control the way Tab would have, then presses Enter on it.
async function activate(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).focus();
  await press(page, 'Enter');
}

// The new element is selected and its name is focused: replace the name and commit it.
async function nameIt(page: Page, defaultName: string, name: string): Promise<void> {
  await expect(page.getByLabel('Name')).toHaveValue(defaultName);
  await expect(page.getByLabel('Name')).toBeFocused();
  await page.keyboard.type(name);
  await press(page, 'Enter');
}

test('builds and changes a diagram with the keyboard alone', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'keyboard');
  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}/diagram`);
  await expect(canvasOf(page)).toBeVisible();

  // Add a process, a data store and a trust boundary from the toolbar. The name is already selected, so
  // typing replaces it.
  await activate(page, 'Add process');
  await nameIt(page, 'New process', 'API');
  await activate(page, 'Add data store');
  await nameIt(page, 'New data store', 'DB');
  await activate(page, 'Add trust boundary');
  await nameIt(page, 'New trust boundary', 'VPC');

  // Connect the two nodes with the dialog: Source and Target are lists, and Tab reaches Create.
  await activate(page, 'Add data flow');
  const dialog = page.getByRole('dialog', { name: 'Add data flow' });
  await expect(dialog.getByLabel('Source')).toBeFocused();
  await press(page, 'Tab'); // Target
  await press(page, 'Tab'); // Cancel
  await press(page, 'Tab'); // Create
  await press(page, 'Enter');
  await nameIt(page, 'New data flow', 'Query');
  await expect.poll(async () => (await stored(base, token, modelId)).byName.get('Query')?.type).toBe('data_flow');
  const api = (await stored(base, token, modelId)).byName.get('API');
  const db = (await stored(base, token, modelId)).byName.get('DB');
  expect((await stored(base, token, modelId)).byName.get('Query')).toMatchObject({ source_element_id: api?.id, target_element_id: db?.id });

  // Choose the API from the Elements list. It is selected, focused on the canvas, and read out.
  await page.getByRole('navigation', { name: 'Elements' }).getByRole('button', { name: 'Process: API' }).focus();
  await press(page, 'Enter');
  await expect(page.getByRole('status', { name: 'Selection' })).toHaveText('Process API, in no trust boundary');
  await expect(nodeOf(page, 'API')).toBeFocused();

  // Put it in the boundary from the properties panel, and set a flag with the space bar.
  await page.getByLabel('Trust boundary', { exact: true }).selectOption({ label: 'VPC' });
  await expect(page.getByRole('status', { name: 'Selection' })).toHaveText('Process API, in VPC');
  await page.getByRole('radiogroup', { name: 'Runs privileged' }).getByRole('radio', { name: 'Yes', exact: true }).focus();
  await press(page, 'Space');
  await expect.poll(async () => {
    const element = (await stored(base, token, modelId)).byName.get('API') as { parent_boundary_id: string | null; properties: unknown } | undefined;
    return element ? [element.parent_boundary_id !== null, element.properties] : null;
  }).toEqual([true, { flags: { runs_privileged: true } }]);

  // Rename it from the keyboard.
  const name = page.getByLabel('Name');
  await name.focus();
  await press(page, 'ControlOrMeta+A');
  await page.keyboard.type('Gateway');
  await press(page, 'Enter');
  await expect.poll(async () => (await stored(base, token, modelId)).byName.get('Gateway')?.type).toBe('process');

  // Move it with the arrow keys: three presses are one move, saved when the keys stop.
  const before = (await stored(base, token, modelId)).byName.get('Gateway')?.layout;
  await page.getByRole('navigation', { name: 'Elements' }).getByRole('button', { name: 'Process: Gateway' }).focus();
  await press(page, 'Enter');
  await expect(nodeOf(page, 'Gateway')).toBeFocused();
  for (let i = 0; i < 3; i += 1) await press(page, 'ArrowRight');
  await expect
    .poll(async () => (await stored(base, token, modelId)).byName.get('Gateway')?.layout?.x)
    .toBe((before?.x ?? 0) + 15);

  // Escape lets go of the selection.
  await press(page, 'Escape');
  await expect(page.getByText('Select an element to see its properties')).toBeVisible();

  // Delete the flow: choose it from the list, press Delete. A flow has nothing else to take with it, so there
  // is no question (FR-021).
  await deleteFromList(page, 'Data flow: Query', 'Query');
  await expect.poll(async () => (await stored(base, token, modelId)).byName.has('Query')).toBe(false);
  await expect(page.getByText('Select an element to see its properties')).toBeVisible();

  // After a reload it is all there.
  const settled = await stored(base, token, modelId);
  await page.reload();
  await untilStill(nodeOf(page, 'Gateway'));
  await expect(nodeOf(page, 'Gateway')).toBeVisible();
  expect((await stored(base, token, modelId)).list).toEqual(settled.list);
});

// The rest of FR-025, again with key presses only: adding an external entity, changing a node's type (and
// confirming the flags that would go), tags, and deleting a node that has flows, which asks first.
test('changes types, tags and deletes a node with its flows, with the keyboard alone', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'keyboard-more');
  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}/diagram`);
  await expect(canvasOf(page)).toBeVisible();

  await activate(page, 'Add external entity');
  await nameIt(page, 'New external entity', 'Partner');
  await activate(page, 'Add process');
  await nameIt(page, 'New process', 'Service');
  await activate(page, 'Add data flow');
  const dialog = page.getByRole('dialog', { name: 'Add data flow' });
  await expect(dialog.getByLabel('Source')).toBeFocused();
  await press(page, 'Tab'); // Target
  await press(page, 'Tab'); // Cancel
  await press(page, 'Tab'); // Create
  await press(page, 'Enter');
  await nameIt(page, 'New data flow', 'Calls');
  await expect.poll(async () => (await stored(base, token, modelId)).byName.get('Calls')?.type).toBe('data_flow');

  const elements = page.getByRole('navigation', { name: 'Elements' });
  const panel = page.getByRole('complementary', { name: 'Properties' });

  // A flag set to yes, then a type it does not apply to: the dialog says which flag would go.
  await elements.getByRole('button', { name: 'External entity: Partner' }).focus();
  await press(page, 'Enter');
  await expect(page.getByLabel('Name')).toHaveValue('Partner');
  await panel.getByRole('radiogroup', { name: 'Authenticated' }).getByRole('radio', { name: 'Yes', exact: true }).focus();
  await press(page, 'Space');
  await panel.getByLabel('Type').selectOption('data_store');
  const change = page.getByRole('dialog');
  await expect(change).toContainText('Authenticated');
  await change.getByRole('button', { name: 'Change type' }).focus();
  await press(page, 'Enter');
  await expect.poll(async () => (await stored(base, token, modelId)).byName.get('Partner')?.type).toBe('data_store');

  // A tag is added with the button, and taken off again with its own.
  await panel.getByLabel('Add a technology tag').focus();
  await page.keyboard.type('PostgreSQL 16');
  await panel.getByRole('button', { name: 'Add tag' }).focus();
  await press(page, 'Enter');
  await expect(panel.getByText('PostgreSQL 16')).toBeVisible();
  await expect
    .poll(async () => ((await stored(base, token, modelId)).byName.get('Partner') as { properties?: { tags?: string[] } } | undefined)?.properties?.tags)
    .toEqual(['PostgreSQL 16']);
  await panel.getByRole('button', { name: 'Remove tag PostgreSQL 16' }).focus();
  await press(page, 'Enter');
  await expect(panel.getByText('PostgreSQL 16')).toBeHidden();

  // Deleting a node that has a flow asks first, and the answer is given with the keys.
  await elements.getByRole('button', { name: 'Process: Service' }).focus();
  await press(page, 'Enter');
  await expect(nodeOf(page, 'Service')).toBeFocused();
  await press(page, 'Delete');
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Delete Service and its 1 data flow?');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).focus();
  await press(page, 'Enter');
  await expect.poll(async () => (await stored(base, token, modelId)).list.map((e) => e.name).sort()).toEqual(['Partner']);
});
