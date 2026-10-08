import { randomUUID } from 'node:crypto';
import { apiToken, expect, seedElements, seedModel, signInAsNewAccount, test } from './fixtures.js';

// The canvas sits below the threat model's header and the generate bar, so a window of the usual height shows only
// part of it. A taller window keeps the drag below on screen, as in the other diagram specs.
test.use({ viewport: { width: 1400, height: 1100 } });

// The gate for the whole diagram editor (research #1, quickstart §2.1). React Flow positions its nodes
// with styles set from script. That is meant to be allowed under `style-src 'self'`, but it is browser
// behavior, so it is proved here, in the built app under the real CSP, before anything is built on it.
// The fixture's page watcher fails the test on any CSP violation or any request to another origin.

test('renders a diagram of a boundary, a node inside it, an entity and a flow, with no CSP violation', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'csp');
  const boundary = randomUUID();
  const processId = randomUUID();
  const entity = randomUUID();
  await seedElements(base, token, modelId, [
    { op: 'create', element: { id: boundary, type: 'trust_boundary', name: 'VPC', layout: { x: 0, y: 0, width: 400, height: 300 } } },
    { op: 'create', element: { id: processId, type: 'process', name: 'API', layout: { x: 40, y: 60 }, parent_boundary_id: boundary } },
    { op: 'create', element: { id: entity, type: 'external_entity', name: 'Browser', layout: { x: 600, y: 60 } } },
    { op: 'create', element: { type: 'data_flow', name: 'HTTPS', source_element_id: entity, target_element_id: processId } },
  ]);

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}/diagram`);

  const canvas = page.getByRole('application', { name: 'Data-flow diagram' });
  await expect(canvas).toBeVisible();
  const vpc = canvas.getByText('VPC', { exact: true });
  const api = canvas.getByText('API', { exact: true });
  const browser = canvas.getByText('Browser', { exact: true });
  await expect(vpc).toBeVisible();
  await expect(api).toBeVisible();
  await expect(browser).toBeVisible();
  await expect(canvas.getByText('HTTPS', { exact: true })).toBeVisible();

  // The process is drawn inside the boundary it belongs to.
  const [vpcBox, apiBox] = await Promise.all([
    canvas.locator('.react-flow__node', { hasText: /^VPC$/ }).boundingBox(),
    canvas.locator('.react-flow__node', { hasText: /^API$/ }).boundingBox(),
  ]);
  expect(vpcBox).not.toBeNull();
  expect(apiBox).not.toBeNull();
  if (vpcBox && apiBox) {
    expect(apiBox.x).toBeGreaterThanOrEqual(vpcBox.x);
    expect(apiBox.y).toBeGreaterThanOrEqual(vpcBox.y);
    expect(apiBox.x + apiBox.width).toBeLessThanOrEqual(vpcBox.x + vpcBox.width);
    expect(apiBox.y + apiBox.height).toBeLessThanOrEqual(vpcBox.y + vpcBox.height);
  }

  // Dragging works: the entity moves on screen.
  const entityNode = canvas.locator('.react-flow__node', { hasText: /^Browser$/ });
  const before = await entityNode.boundingBox();
  expect(before).not.toBeNull();
  if (before) {
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 - 120, before.y + before.height / 2 + 80, { steps: 8 });
    await page.mouse.up();
    const after = await entityNode.boundingBox();
    expect(after).not.toBeNull();
    if (after) {
      expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);
      expect(Math.abs(after.y - before.y)).toBeGreaterThan(30);
    }
  }
});
