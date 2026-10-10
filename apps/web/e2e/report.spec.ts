import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Download, Page } from '@playwright/test';
import { addNode } from './diagram-helpers.js';
import { apiRequest, apiToken, expect, seedElements, seedModel, signInAsNewAccount, test } from './fixtures.js';

// The button sits in the page header, and the canvas below it: a taller window keeps both on screen.
test.use({ viewport: { width: 1400, height: 1500 } });

// Phase 2 / Milestone 5 and 6 in a real browser against the built app and a real database (quickstart §2): the Definition
// of Done's "export a Markdown report and an OTM file" and "re-import the OTM round-trip without losing elements or
// threats". The diagram is seeded through the batch endpoint, as the other specs do; the statuses and mitigations are
// set through the API, because threat-workflow.spec.ts drives those from the page.

interface StoredThreat {
  id: string;
  element_id: string | null;
  title: string;
  status: string;
  category: string;
  risk: string;
}

const create = (id: string, type: string, name: string, extra: Record<string, unknown> = {}) => ({ op: 'create', element: { id, type, name, ...extra } });

const generateStatus = (page: Page) => page.locator('.generate-bar [role="status"]');

async function textOf(download: Download): Promise<string> {
  return readFileSync(await download.path(), 'utf8');
}

test('exports a Markdown report and an OTM file of a drawn, analysed and worked-through threat model, and imports the OTM back (US1, SC-007)', async ({ page, baseURL, browser: chromium }, testInfo) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const label = 'report';
  const { modelId } = await seedModel(base, token, label);
  const [boundary, api, store, browser, https, sql] = Array.from({ length: 6 }, () => randomUUID()) as [string, string, string, string, string, string];
  await seedElements(base, token, modelId, [
    create(browser, 'external_entity', 'Browser', { layout: { x: 20, y: 100 } }),
    create(boundary, 'trust_boundary', 'Internal network', { layout: { x: 300, y: 20, width: 560, height: 260 } }),
    create(api, 'process', 'API', { layout: { x: 20, y: 80 }, parent_boundary_id: boundary }),
    create(store, 'data_store', 'Orders DB', { layout: { x: 320, y: 80 }, parent_boundary_id: boundary }),
    create(https, 'data_flow', 'HTTPS request', { source_element_id: browser, target_element_id: api }),
    create(sql, 'data_flow', 'SQL', { source_element_id: api, target_element_id: store }),
  ]);

  // 1. Draw is done; generate the threats from the diagram.
  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}/diagram`);
  await page.getByRole('button', { name: 'Generate threats' }).click();
  await expect(generateStatus(page)).toHaveText(/^Generated threats: \d+ created/);

  // 2. Work through two of them: one accepted with its reason, one mitigated once a mitigation is implemented.
  const threats = (await apiRequest(base, token, 'GET', `/api/v1/threat-models/${modelId}/threats`)).body as StoredThreat[];
  expect(threats.length).toBeGreaterThan(4);
  const [toAccept, toMitigate] = [threats[0], threats[1]] as [StoredThreat, StoredThreat];
  expect((await apiRequest(base, token, 'PATCH', `/api/v1/threats/${toAccept.id}`, { status: 'accepted', status_reason: 'The platform team accepted this.' })).status).toBe(200);
  expect((await apiRequest(base, token, 'POST', '/api/v1/mitigations', { threat_id: toMitigate.id, description: 'Fixed in the gateway', status: 'implemented' })).status).toBe(201);
  expect((await apiRequest(base, token, 'PATCH', `/api/v1/threats/${toMitigate.id}`, { status: 'mitigated' })).status).toBe(200);
  await page.reload();

  // 3. What the Threats view says about the whole model, to compare the report's summary with.
  await page.getByRole('link', { name: 'Threats' }).click();
  const summary = page.getByRole('region', { name: 'Threat summary' });
  const shown = async (name: string): Promise<number> => Number(await summary.getByText(name, { exact: true }).locator('xpath=following-sibling::dd[1]').textContent());
  const onScreen = { open: await shown('Open'), mitigated: await shown('Mitigated'), accepted: await shown('Accepted'), notApplicable: await shown('Not applicable') };
  expect(onScreen.accepted).toBe(1);
  expect(onScreen.mitigated).toBe(1);

  // 4. Download the Markdown report from the Threats view.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Markdown report' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^report-\d+-[0-9a-f]{6}-report-\d{4}-\d{2}-\d{2}\.md$/);
  const markdown = await textOf(download);
  const lines = markdown.split('\n');
  const today = new Date().toISOString().slice(0, 10);
  expect(download.suggestedFilename()).toContain(`-report-${today}.md`);

  // The header and the summary, equal to the Threats view's.
  // The threat model's name, with its hyphen escaped as the report escapes every punctuation mark.
  expect(lines[0]).toMatch(/^# Threat model report: report \d+\\-[0-9a-f]{6}$/);
  expect(markdown).toContain('- **Methodology:** STRIDE');
  expect(markdown).toContain('- **Threat model status:** Draft');
  const cell = (row: string): number => Number(new RegExp(`^\\| ${row} \\| (\\d+) \\|$`, 'm').exec(markdown)?.[1]);
  expect({ open: cell('Open'), mitigated: cell('Mitigated'), accepted: cell('Accepted'), notApplicable: cell('Not applicable') }).toEqual(onScreen);
  expect(markdown).toContain(`| **Total** | **${threats.length}** |`);

  // The diagram, as a flowchart: one boundary and the two flows.
  const chart = /```mermaid\n([\s\S]*?)\n```/.exec(markdown)?.[1] ?? '';
  expect(chart.match(/subgraph /g)).toHaveLength(1);
  // Two arrows: the pieces either side of each `-->` (counted as text, not parsed).
  expect(chart.split('-->').length - 1).toBe(2);
  expect(chart).toContain('"HTTPS request"');
  expect(chart).toContain('"SQL"');

  // Elements by trust boundary: the boundary holds API, Orders DB and SQL; Browser and its flow are outside.
  const headings = lines.filter((line) => /^#{3,4} /.test(line));
  expect(headings).toEqual(
    expect.arrayContaining([
      '### E1 · Trust boundary · Internal network',
      '#### E2 · Process · API',
      '#### E3 · Data store · Orders DB',
      '#### E4 · Data flow · SQL',
      '### Outside any trust boundary',
      '#### E5 · External entity · Browser',
      '#### E6 · Data flow · HTTPS request',
    ]),
  );
  expect(headings.indexOf('#### E4 · Data flow · SQL')).toBeLessThan(headings.indexOf('### Outside any trust boundary'));

  // What each element is, and which flows cross the trust boundary (spec US3): the browser reaches in, SQL stays inside.
  expect(markdown).toContain('- **Crosses a trust boundary:** Yes (from outside any trust boundary to Internal network)');
  expect(markdown).toContain('- **From:** E2 API\n- **To:** E3 Orders DB\n- **Crosses a trust boundary:** No');
  expect(markdown).toContain('- **Crosses a trust boundary:** No');
  expect(markdown).toContain('- **Internet facing:** Not assessed');

  // Every generated threat once, and the work done on them.
  expect(lines.filter((line) => line.startsWith('##### ') && !line.includes('Threats of this boundary'))).toHaveLength(threats.length);
  expect(markdown).toContain('- **Status:** Accepted');
  expect(markdown).toContain('  > The platform team accepted this\\.');
  expect(markdown).toContain('- **Status:** Mitigated');
  // Numbered among the mitigations the rules suggested for it, which are sorted by description.
  expect(markdown).toMatch(/^\d+\. \*\*Implemented\*\* — Fixed in the gateway$/m);
  expect(markdown).not.toContain('**Missing:**');

  // 5. The HTML report, from the same view. Opened from disk, in a page of its own, it says what the Markdown says.
  const [htmlDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download HTML report (print or save as PDF)' }).click()]);
  expect(htmlDownload.suggestedFilename()).toMatch(/^report-\d+-[0-9a-f]{6}-report-\d{4}-\d{2}-\d{2}\.html$/);
  expect(htmlDownload.suggestedFilename()).toContain(`-report-${today}.html`);
  const file = testInfo.outputPath('report.html');
  await htmlDownload.saveAs(file);
  const reader = await chromium.newContext();
  const readerPage = await reader.newPage();
  await readerPage.goto(pathToFileURL(file).href);
  // The report orders threats by element and risk; the same threats, in any order, are what matters here.
  const shownThreats = (await readerPage.locator('article.threat > h5').allInnerTexts()).sort();
  expect(shownThreats).toEqual(threats.map((t) => `${t.title} — ${t.risk}`).sort());
  // One shape per element on the diagram (a boundary and three nodes), and one arrow per flow.
  await expect(readerPage.locator('svg g.shape')).toHaveCount(4);
  await expect(readerPage.locator('svg g.flow')).toHaveCount(2);
  await expect(readerPage.locator('article.element > h4')).toHaveText(['E2 · Process · API', 'E3 · Data store · Orders DB', 'E4 · Data flow · SQL', 'E5 · External entity · Browser', 'E6 · Data flow · HTTPS request']);
  await reader.close();

  // 6. The OTM file, from the same view (Phase 2 Definition of Done): imported into another project through the preview
  // it is the same model, with every element and threat, and the statuses the work gave them.
  const [otmDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download OTM file' }).click()]);
  expect(otmDownload.suggestedFilename()).toMatch(/^report-\d+-[0-9a-f]{6}-\d{4}-\d{2}-\d{2}\.otm\.json$/);
  const target = await seedModel(base, token, 'report-target');
  await page.goto(`/projects/${target.projectId}`);
  await page.getByRole('button', { name: 'Import threat model' }).click();
  await page.getByLabel('File to import').setInputFiles(await otmDownload.path());
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await expect(page.getByText('OTM file')).toBeVisible();
  await expect(page.getByText('Everything in this file will be imported.')).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page).toHaveURL(/\/threat-models\/[0-9a-f-]{36}$/);
  const importedId = /\/threat-models\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? '';
  expect(importedId).not.toBe(modelId);
  // Nothing was left out, so the page carries no "What the import left out" region.
  await expect(page.getByRole('heading', { name: /\S/, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'What the import left out' })).toHaveCount(0);
  const read = async (id: string, kind: string) => (await apiRequest(base, token, 'GET', `/api/v1/threat-models/${id}/${kind}`)).body as Record<string, string | null>[];
  const summarise = async (id: string) => ({
    elements: (await read(id, 'elements')).map((e) => `${e.type}|${e.name}`).sort(),
    threats: (await read(id, 'threats')).map((t) => `${t.title}|${t.category}|${t.status}|${t.status_reason ?? ''}|${t.risk}|${t.origin}`).sort(),
    mitigations: (await read(id, 'mitigations')).map((m) => `${m.description}|${m.status}`).sort(),
  });
  expect(await summarise(importedId)).toEqual(await summarise(modelId));
  expect(((await apiRequest(base, token, 'POST', `/api/v1/threat-models/${importedId}/threats/generate`, {})).body as { created: number }).created).toBe(0);
  await page.goto(`/threat-models/${modelId}`);

  // 7. The same button on the Diagram view; with a diagram change still being saved, it asks first.
  await page.getByRole('link', { name: 'Diagram' }).click();
  // Saves are held, never answered, until the route is removed; removing it lets the held request through, and the
  // saves that follow (the rename) are not held at all.
  const hold = (): Promise<void> => Promise.resolve();
  await page.route('**/elements/batch', hold);
  await addNode(page, 'Add process', 'Late addition');
  const downloaded: string[] = [];
  page.on('download', (d) => downloaded.push(d.suggestedFilename()));
  await page.getByRole('button', { name: 'Download Markdown report' }).click();
  const dialog = page.getByRole('dialog', { name: 'Download report?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Some diagram changes aren't saved yet. The report shows only what is saved.");
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(500);
  expect(downloaded).toEqual([]);
  await page.unroute('**/elements/batch', hold);
  await expect(page.getByText('All changes saved')).toBeVisible();
});
