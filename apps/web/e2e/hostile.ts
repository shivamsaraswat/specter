import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { apiRequest, expect, seedElements, seedModel, signInAsNewAccount } from './fixtures.js';

// Every kind of Markdown, HTML and Mermaid syntax, one string each (contracts/report-format.md "Escaping fixtures").
// The API trims the text it stores, so a seeded value is `.trim()` of these.
export const HOSTILE = [
  '# Heading?',
  'a | pipe | b |',
  '*emphasis* _under_ ~~strike~~',
  '[link](https://evil.example)',
  '![img](https://evil.example/x.png)',
  '<https://evil.example>',
  'https://evil.example',
  'www.evil.example',
  'user@evil.example',
  '<script>window.__ran = 1</script>',
  '<img src=x onerror="window.__ran=1">',
  '<b>bold</b>',
  '`code` ```fence```',
  '--> end subgraph',
  `"quotes" 'single'`,
  '#35; &amp; &lt;',
  '\\backslash\\',
  '1. not a list',
  '- not a list',
  '> not a quote',
  '    four leading spaces',
  'javascript:alert(1)',
] as const;

export const HOSTILE_MULTILINE = 'line one\nline two\n\nparagraph after a blank line';

// A ticket must be an http or https address to be stored at all, so this is the hostile one the API accepts.
export const HOSTILE_TICKET = 'https://evil.example/a_b*c?x=1&y=<2>';

export const BOUNDARY_NAME = '<b>boundary</b> "q"';
export const FLOW_NAME = '<i>flow</i> & "x" [y](z)';
export const MODEL_NAME = '<b>bold</b> | model # 1';
export const PROJECT_NAME = '[project](https://evil.example) *x*';

// A word with no break in it, longer than any line: it must wrap inside its section, not run off the page.
export const LONG_TOKEN = 'x'.repeat(300);

export interface HostileModel {
  modelId: string;
  // As stored: trimmed.
  nodeNames: string[];
  boundaryName: string;
  flowName: string;
  threatTitles: string[];
}

// A threat model whose every user-text field holds hostile text: model and project names, a boundary, one process per
// string (its name and its tag), a flow, a threat per string (title, multi-line description, multi-line reason), and a
// mitigation per threat (description, ticket). Written through the API, as a user's data is.
export async function seedHostileModel(base: string, token: string, label: string): Promise<HostileModel> {
  const { projectId, modelId } = await seedModel(base, token, label);
  expectOk(await apiRequest(base, token, 'PATCH', `/api/v1/projects/${projectId}`, { name: `${PROJECT_NAME} ${randomUUID().slice(0, 6)}` }));
  expectOk(await apiRequest(base, token, 'PATCH', `/api/v1/threat-models/${modelId}`, { name: MODEL_NAME }));

  const boundary = randomUUID();
  const ids = HOSTILE.map(() => randomUUID());
  const flow = randomUUID();
  const create = (id: string, type: string, name: string, extra: Record<string, unknown>) => ({ op: 'create', element: { id, type, name, ...extra } });
  const elements = await seedElements(base, token, modelId, [
    create(boundary, 'trust_boundary', BOUNDARY_NAME, { layout: { x: 0, y: 0, width: 760, height: 520 } }),
    ...HOSTILE.map((text, i) =>
      create(ids[i] as string, 'process', text, {
        layout: { x: 20 + (i % 4) * 170, y: 60 + Math.floor(i / 4) * 80 },
        properties: { tags: [text] },
        ...(i % 2 === 0 ? { parent_boundary_id: boundary } : {}),
      }),
    ),
    create(flow, 'data_flow', FLOW_NAME, { source_element_id: ids[0], target_element_id: ids[1] }),
  ]);
  expect(elements).toHaveLength(HOSTILE.length + 2);

  const threatTitles: string[] = [];
  for (const [i, text] of HOSTILE.entries()) {
    const title = text.trim();
    const accepted = i % 2 === 0;
    const threat = await apiRequest(base, token, 'POST', '/api/v1/threats', {
      threat_model_id: modelId,
      element_id: ids[i],
      category: 'Tampering',
      title,
      description: `${text}\n${HOSTILE_MULTILINE}`,
      likelihood: 'Medium',
      impact: 'High',
      origin: 'manual',
      status: accepted ? 'accepted' : 'not_applicable',
      status_reason: `${text}\n${HOSTILE_MULTILINE}`,
    });
    expectOk(threat, 201);
    threatTitles.push(title);
    expectOk(
      await apiRequest(base, token, 'POST', '/api/v1/mitigations', {
        threat_id: (threat.body as { id: string }).id,
        description: text,
        status: 'proposed',
        external_ref: HOSTILE_TICKET,
      }),
      201,
    );
  }
  expectOk(
    await apiRequest(base, token, 'POST', '/api/v1/threats', {
      threat_model_id: modelId,
      element_id: ids[0],
      category: 'Denial of Service',
      title: 'Long token',
      description: LONG_TOKEN,
      likelihood: 'Low',
      impact: 'Low',
      origin: 'manual',
    }),
    201,
  );
  return { modelId, nodeNames: HOSTILE.map((text) => text.trim()), boundaryName: BOUNDARY_NAME, flowName: FLOW_NAME, threatTitles };
}

function expectOk(res: { status: number; body: unknown }, status = 200): void {
  if (res.status !== status) throw new Error(`Seeding failed with status ${res.status}: ${JSON.stringify(res.body)}`);
}

// The HTML report as a person gets it: signed in, from the page's own button, kept from the download. Nothing is
// written by hand, so what is opened afterwards is exactly what the app handed to the browser.
export async function downloadHtmlReport(page: Page, base: string, modelId: string, file: string): Promise<void> {
  await signInAsNewAccount(page, base);
  await page.goto(`/threat-models/${modelId}`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download HTML report (print or save as PDF)' }).click()]);
  await download.saveAs(file);
}

// The report of a threat model, fetched with a bearer token, as an API client would.
export async function fetchReport(base: string, token: string, modelId: string, format: 'markdown' | 'html'): Promise<string> {
  const res = await fetch(`${base}/api/v1/threat-models/${modelId}/report?format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 200) throw new Error(`The report answered ${res.status}`);
  return res.text();
}
