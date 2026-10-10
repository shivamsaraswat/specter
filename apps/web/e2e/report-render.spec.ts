import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { apiToken, expect, test } from './fixtures.js';
import {
  BOUNDARY_NAME,
  FLOW_NAME,
  HOSTILE,
  HOSTILE_MULTILINE,
  HOSTILE_TICKET,
  LONG_TOKEN,
  MODEL_NAME,
  downloadHtmlReport,
  fetchReport,
  seedHostileModel,
} from './hostile.js';

// Phase 2 / Milestone 5 in a real browser (quickstart §3): what a viewer really does with the report. Markdown is
// stood in for by micromark in the API's unit tests; Mermaid is not a stand-in here, it is the real thing.
//
// Mermaid 12.1.0, found in the installed package (tasks T002):
//  - the browser bundle is `mermaid/dist/mermaid.min.js`, which sets `window.mermaid`;
//  - `mermaid.mermaidAPI.getSiteConfig()` holds the defaults, with `maxTextSize` 50000 and `maxEdges` 500.

const mermaidBundle = createRequire(import.meta.url).resolve('mermaid/dist/mermaid.min.js');

test('Mermaid draws the report’s flowchart, with every name as typed (FR-007, SC-005, FR-007a’s limits)', async ({ browser, baseURL }) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const hostile = await seedHostileModel(base, token, 'render');
  const markdown = await fetchReport(base, token, hostile.modelId, 'markdown');
  const chart = /```mermaid\n([\s\S]*?)\n```/.exec(markdown)?.[1] ?? '';
  expect(chart.startsWith('flowchart LR')).toBe(true);

  // A page with no network at all: Mermaid is added from the installed package.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', (route) => route.abort());
  await page.setContent('<!doctype html><title>mermaid</title><div id="out"></div>');
  await page.addScriptTag({ path: mermaidBundle });

  const limits = await page.evaluate(() => {
    const { maxTextSize, maxEdges } = (window as unknown as { mermaid: { mermaidAPI: { getSiteConfig(): { maxTextSize: number; maxEdges: number } } } }).mermaid.mermaidAPI.getSiteConfig();
    return { maxTextSize, maxEdges };
  });
  // The report's own limits leave room under what Mermaid draws by default (research #9).
  expect(40_000).toBeLessThan(limits.maxTextSize);
  expect(400).toBeLessThan(limits.maxEdges);

  const drawn = await page.evaluate(async (source) => {
    const mermaid = (window as unknown as { mermaid: { initialize(config: object): void; render(id: string, text: string): Promise<{ svg: string }> } }).mermaid;
    mermaid.initialize({ startOnLoad: false });
    const { svg } = await mermaid.render('report-chart', source);
    const out = document.getElementById('out') as HTMLElement;
    out.innerHTML = svg;
    const texts = (selector: string) => [...out.querySelectorAll(selector)].map((node) => (node.textContent ?? '').trim());
    return {
      error: out.textContent?.includes('Syntax error') ?? false,
      nodes: texts('g.node .nodeLabel'),
      clusters: texts('g.cluster .cluster-label'),
      edges: texts('g.edgeLabel').filter((text) => text !== ''),
      scripts: out.querySelectorAll('script').length,
      ran: (window as unknown as { __ran?: number }).__ran ?? null,
    };
  }, chart);

  expect(drawn.error).toBe(false);
  expect(drawn.scripts).toBe(0);
  expect(drawn.ran).toBeNull();
  // One node per process, one cluster for the boundary, one edge for the flow, each reading exactly as typed.
  expect([...drawn.nodes].sort()).toEqual([...hostile.nodeNames].sort());
  expect(drawn.clusters).toEqual([BOUNDARY_NAME]);
  expect(drawn.edges).toEqual([FLOW_NAME]);
  await context.close();
});

// ---- the HTML file (US2) ----

const squash = (value: string): string => value.replaceAll(/\s+/g, ' ').trim();

test('the HTML file opens offline from disk, runs nothing, loads nothing and shows every string as typed (FR-014, FR-016, SC-005)', async ({
  page: app,
  browser,
  baseURL,
}, testInfo) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const hostile = await seedHostileModel(base, token, 'html');
  const file = testInfo.outputPath('report.html');
  await downloadHtmlReport(app, base, hostile.modelId, file);

  // A page that can reach nothing: every request but the document itself is refused, and counted.
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  // The document is a file on disk; anything else it asked for would be refused.
  await context.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : route.abort()));
  await page.addInitScript(() => {
    (window as unknown as { __violations: string[] }).__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __violations: string[] }).__violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.goto(pathToFileURL(file).href);

  // Nothing ran, nothing was blocked, nothing was fetched.
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __ran?: number }).__ran ?? null)).toBeNull();
  expect(requests.filter((url) => !url.startsWith('file:'))).toEqual([]);
  expect(await page.locator('script, link, img, iframe, object, embed').count()).toBe(0);

  // Every hostile string, as typed: in names, tags are not part of US2; titles, descriptions, reasons, mitigations.
  const shown = squash(await page.locator('body').innerText());
  for (const text of HOSTILE) expect(shown, text).toContain(squash(text));
  expect(shown).toContain(squash(HOSTILE_MULTILINE));
  expect(shown).toContain(squash(MODEL_NAME));
  expect(shown).toContain(squash(BOUNDARY_NAME));
  expect(shown).toContain(squash(FLOW_NAME));

  // The only links are the tickets, and each is safe and shows its address.
  const links = page.locator('a[href]');
  expect(await links.count()).toBe(HOSTILE.length);
  for (const link of await links.all()) {
    // The attribute is the address as stored; the browser percent-encodes it only when the link is followed.
    await expect(link).toHaveAttribute('href', HOSTILE_TICKET);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(squash(await link.innerText())).toBe(HOSTILE_TICKET);
  }

  // The diagram: one shape per element, a flow with its arrowhead drawn.
  await expect(page.locator('svg g.shape')).toHaveCount(HOSTILE.length + 1);
  await expect(page.locator('svg g.flow')).toHaveCount(1);
  expect(await page.locator('svg line.flow-line').evaluate((line) => getComputedStyle(line).markerEnd)).toContain('#arrow');
  await context.close();
});

test('the HTML file prints as a report and fits the page, on a narrow screen and a wide one (FR-008, FR-019, FR-020)', async ({
  page: app,
  browser,
  baseURL,
}, testInfo) => {
  const base = baseURL ?? '';
  const token = await apiToken(base);
  const hostile = await seedHostileModel(base, token, 'print');
  const file = testInfo.outputPath('print.html');
  await downloadHtmlReport(app, base, hostile.modelId, file);

  for (const width of [320, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    await page.goto(pathToFileURL(file).href);
    // No horizontal scroll on the page: the figure scrolls by itself, and a word with no break wraps (the "Very long
    // text" edge case).
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const longToken = page.locator('article.threat', { hasText: LONG_TOKEN });
    await expect(longToken).toHaveCount(1);
    expect(await longToken.evaluate((threat) => threat.scrollWidth <= threat.clientWidth)).toBe(true);
    expect(await page.getByText(LONG_TOKEN).count()).toBe(1);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1024, height: 800 } });
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.emulateMedia({ media: 'print' });
  const computed = await page.evaluate(() => {
    const style = (selector: string, property: 'breakInside' | 'breakAfter') => getComputedStyle(document.querySelector(selector) as Element)[property];
    const figure = document.querySelector('figure') as Element;
    const svg = document.querySelector('figure svg') as SVGElement;
    return {
      threat: style('article.threat', 'breakInside'),
      table: style('table', 'breakInside'),
      figure: style('figure', 'breakInside'),
      elementHeading: style('article.element > h4', 'breakAfter'),
      threatHeading: style('article.threat > h5', 'breakAfter'),
      svgMaxWidth: getComputedStyle(svg).maxWidth,
      svgFits: svg.getBoundingClientRect().width <= figure.getBoundingClientRect().width + 1,
    };
  });
  expect(computed).toEqual({
    threat: 'avoid',
    table: 'avoid',
    figure: 'avoid',
    elementHeading: 'avoid',
    threatHeading: 'avoid',
    svgMaxWidth: '100%',
    svgFits: true,
  });
  // It can be saved as a PDF without a headless browser of our own.
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10_000);
  await context.close();
});
