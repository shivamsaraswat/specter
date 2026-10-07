import { randomUUID } from 'node:crypto';
import { boxOf, canvasOf, centerOf, elementsOf, nodeOf, stored, untilSaved, untilStill } from './diagram-helpers.js';
import { apiRequest, apiToken, expect, seedElements, seedModel, signInAsNewAccount, test } from './fixtures.js';

// SC-004, SC-007, SC-011, and the spec edge case "Narrow screens": the editor holds up at size. Everything is
// seeded through the batch endpoint, and only what each test is about is measured. These are regression guards on
// a shared runner; research #16 says how the numbers are measured.

test.use({ viewport: { width: 1400, height: 1100 } });

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
};

test('shows 150 elements within 3 seconds of opening, and a drag stays smooth (SC-004)', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'large-150');

  // Ten boundaries in two rows, each holding eight nodes in two rows of four, and six flows among them: 10 + 80 + 60.
  const operations: unknown[] = [];
  const flows: unknown[] = [];
  for (let b = 0; b < 10; b += 1) {
    const boundary = randomUUID();
    operations.push({
      op: 'create',
      element: { id: boundary, type: 'trust_boundary', name: `Zone ${b + 1}`, layout: { x: (b % 5) * 700, y: Math.floor(b / 5) * 400, width: 660, height: 340 } },
    });
    const nodes: string[] = [];
    for (let n = 0; n < 8; n += 1) {
      const node = randomUUID();
      nodes.push(node);
      operations.push({
        op: 'create',
        element: {
          id: node,
          type: ['process', 'data_store', 'external_entity'][n % 3],
          name: `Node ${b + 1}.${n + 1}`,
          parent_boundary_id: boundary,
          layout: { x: 20 + (n % 4) * 155, y: 50 + Math.floor(n / 4) * 130 },
        },
      });
    }
    for (let f = 0; f < 6; f += 1) {
      flows.push({ op: 'create', element: { type: 'data_flow', name: `Flow ${b + 1}.${f + 1}`, source_element_id: nodes[f], target_element_id: nodes[f + 1] } });
    }
  }
  await seedElements(base, token, modelId, [...operations, ...flows]);
  expect(await elementsOf(base, token, modelId)).toHaveLength(150);

  await signInAsNewAccount(page, base);
  const started = Date.now();
  await page.goto(`/threat-models/${modelId}/diagram`);
  await expect(canvasOf(page).locator('.react-flow__node')).toHaveCount(90, { timeout: 3000 });
  await expect(canvasOf(page).locator('.react-flow__edge')).toHaveCount(60, { timeout: 3000 });
  const shown = Date.now() - started;
  console.log(`150 elements shown in ${shown} ms`);
  expect(shown).toBeLessThan(3000);

  // A two-second drag of a boundary, which carries its eight nodes, with the frame times recorded.
  await untilStill(nodeOf(page, 'Zone 3'));
  await canvasOf(page).scrollIntoViewIfNeeded();
  const label = nodeOf(page, 'Zone 3').locator('.diagram-boundary__label');
  const from = await centerOf(label);
  await page.evaluate(() => {
    const frames: number[] = [];
    const w = window as unknown as { __frames: number[]; __recording: boolean };
    w.__frames = frames;
    w.__recording = true;
    const tick = (time: number): void => {
      frames.push(time);
      if (w.__recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 1; Date.now() - t0 < 2000; i += 1) {
    await page.mouse.move(from.x + Math.sin(i / 8) * 60, from.y + Math.cos(i / 8) * 40 - 40);
  }
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __recording: boolean };
    w.__recording = false;
    return w.__frames;
  });
  const gaps = frames.slice(1).map((time, i) => time - (frames[i] ?? time));
  const p95 = percentile(gaps, 0.95);
  console.log(`drag over ${gaps.length} frames: p95 frame interval ${p95.toFixed(1)} ms`);
  expect(gaps.length).toBeGreaterThan(20);
  expect(p95).toBeLessThanOrEqual(50);
  await untilSaved(page);
});

test('opens a threat model with 1,000 elements, refuses a 1,001st, and says so (SC-011)', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'large-1000');
  const ids = Array.from({ length: 900 }, () => randomUUID());
  await seedElements(base, token, modelId, [
    ...ids.map((id, i) => ({
      op: 'create',
      element: { id, type: 'process', name: `P${i}`, layout: { x: (i % 30) * 180, y: Math.floor(i / 30) * 100 } },
    })),
    ...Array.from({ length: 100 }, (_, i) => ({
      op: 'create',
      element: { type: 'data_flow', name: `F${i}`, source_element_id: ids[i], target_element_id: ids[i + 1] },
    })),
  ]);
  expect(await elementsOf(base, token, modelId)).toHaveLength(1000);

  // Storage refuses the 1,001st, and says why.
  const refused = await apiRequest(base, token, 'POST', '/api/v1/elements', { threat_model_id: modelId, type: 'process', name: 'One too many', layout: { x: 0, y: 0 } });
  expect(refused.status).toBe(400);
  expect(JSON.stringify(refused.body)).toContain('at most 1,000 elements');
  expect(await elementsOf(base, token, modelId)).toHaveLength(1000);

  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}/diagram`);
  await expect(canvasOf(page)).toBeVisible();
  await expect(page.getByText('This threat model has reached the limit of 1,000 elements.')).toBeVisible();
  for (const name of ['Add external entity', 'Add process', 'Add data store', 'Add trust boundary', 'Add data flow']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  // Nothing was added by looking at it.
  expect(await elementsOf(base, token, modelId)).toHaveLength(1000);
});

test('shows 20 elements that were never placed, all of them and none on top of another (SC-007)', async ({ page, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const { modelId } = await seedModel(base, token, 'unplaced');
  await seedElements(
    base,
    token,
    modelId,
    Array.from({ length: 20 }, (_, i) => ({ op: 'create', element: { type: ['process', 'data_store', 'external_entity'][i % 3], name: `Node ${i + 1}`, layout: null } })),
  );
  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}/diagram`);
  await untilStill(nodeOf(page, 'Node 20'));
  await canvasOf(page).scrollIntoViewIfNeeded();
  await untilStill(nodeOf(page, 'Node 20'));

  const canvas = await boxOf(canvasOf(page));
  const boxes = [];
  for (let i = 1; i <= 20; i += 1) {
    const node = nodeOf(page, `Node ${i}`);
    await expect(node).toBeVisible();
    const box = await boxOf(node);
    // Inside the canvas, so it can be seen without panning.
    expect(box.x, `Node ${i} left`).toBeGreaterThanOrEqual(canvas.x - 1);
    expect(box.y, `Node ${i} top`).toBeGreaterThanOrEqual(canvas.y - 1);
    expect(box.x + box.width, `Node ${i} right`).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(box.y + box.height, `Node ${i} bottom`).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
    boxes.push({ name: `Node ${i}`, ...box });
  }
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart = a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5;
      expect(apart, `${a.name} and ${b.name} overlap`).toBe(true);
    }
  }
  // Being shown does not place them: nothing is written until the user moves one.
  expect((await stored(base, token, modelId)).list.every((e) => e.layout === null)).toBe(true);
});

test.describe('on a narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the diagram, pans and zooms it, and edits an element, without scrolling sideways', async ({ page, baseURL }) => {
    const base = baseURL ?? '';
    const token = await apiToken(base);
    const { modelId } = await seedModel(base, token, 'narrow');
    await seedElements(base, token, modelId, [
      { op: 'create', element: { type: 'process', name: 'API', layout: { x: 0, y: 0 } } },
      { op: 'create', element: { type: 'data_store', name: 'Store', layout: { x: 300, y: 0 } } },
    ]);
    await signInAsNewAccount(page, base);
    await page.goto(`/threat-models/${modelId}/diagram`);
    const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    await expect(nodeOf(page, 'API')).toBeVisible();
    await untilStill(nodeOf(page, 'Store'));
    await canvasOf(page).scrollIntoViewIfNeeded();
    expect(await noSideways()).toBe(true);

    // Zoomed with the wheel, panned by dragging the empty canvas.
    const viewport = canvasOf(page).locator('.react-flow__viewport');
    const transform = () => viewport.evaluate((element) => getComputedStyle(element).transform);
    const canvas = await boxOf(canvasOf(page));
    const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    const initial = await transform();
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(transform).not.toBe(initial);
    const zoomed = await transform();
    const empty = { x: canvas.x + 20, y: canvas.y + canvas.height - 20 };
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x + 30, empty.y - 30, { steps: 5 });
    await page.mouse.up();
    await expect.poll(transform).not.toBe(zoomed);

    // The properties panel is below the canvas on a narrow screen: choose an element, rename it there.
    await nodeOf(page, 'API').locator('.diagram-node__label').click();
    const name = page.getByLabel('Name');
    await name.scrollIntoViewIfNeeded();
    await expect(name).toHaveValue('API');
    expect(await noSideways()).toBe(true);
    await name.fill('Gateway');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await stored(base, token, modelId)).byName.has('Gateway')).toBe(true);
    expect(await noSideways()).toBe(true);
  });
});
