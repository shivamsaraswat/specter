import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../../../src/app.js';
import { renderMarkdown } from '../../../src/report/markdown.js';
import { login, startTestServer, type TestServer } from '../helpers.js';
import { captureWriteLog, client, uniqueName, type ApiRecord, type V1Client } from './helpers.js';

// contracts/report-api.md: GET /api/v1/threat-models/{id}/report?format=...

// A mock that behaves as the real renderer until a test says otherwise, to see what a failing renderer leaves in the logs.
vi.mock('../../../src/report/markdown.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/report/markdown.js')>();
  return { ...original, renderMarkdown: vi.fn(original.renderMarkdown) };
});

const FORMAT_REFUSED = { error: 'format must be markdown or html' };
const count = (text: string, needle: string): number => text.split(needle).length - 1;

// The unique text put in the name of every element, the title of every threat and the description of every mitigation
// of a seeded model, so a report can be searched for each of them.
interface Markers {
  threats: string[];
  mitigations: string[];
  elements: string[];
}

describe('the report operation', () => {
  let server: TestServer;
  let token: string;
  let c: V1Client;
  let modelId: string;
  let markers: Markers;

  const report = (id: string, query: string, bearer: string | null = token) =>
    fetch(`${server.baseUrl}/api/v1/threat-models/${id}/report${query}`, { headers: bearer === null ? {} : { Authorization: `Bearer ${bearer}` } });

  async function seed(modelName: string, text: (marker: string) => string): Promise<{ id: string; markers: Markers }> {
    const markers: Markers = { threats: [], mitigations: [], elements: [] };
    const project = (await c.post<ApiRecord>('/projects', { name: uniqueName('Report') })).body;
    const model = (await c.post<ApiRecord>('/threat-models', { project_id: project.id, name: modelName })).body;
    let n = 0;
    const next = (kind: keyof Markers): string => {
      const marker = `Tmk${String(++n).padStart(4, '0')}`;
      markers[kind].push(marker);
      return marker;
    };
    const element = async (body: Record<string, unknown>): Promise<ApiRecord> =>
      (await c.post<ApiRecord>('/elements', { threat_model_id: model.id, ...body })).body;

    const outer = await element({ type: 'trust_boundary', name: text(next('elements')), layout: { x: 0, y: 0, width: 600, height: 400 } });
    const inner = await element({ type: 'trust_boundary', name: text(next('elements')), parent_boundary_id: outer.id, layout: { x: 300, y: 80, width: 260, height: 200 } });
    const api = await element({ type: 'process', name: text(next('elements')), parent_boundary_id: outer.id, layout: { x: 20, y: 60 } });
    const db = await element({ type: 'data_store', name: text(next('elements')), parent_boundary_id: inner.id, layout: { x: 20, y: 40 } });
    const browser = await element({ type: 'external_entity', name: text(next('elements')), layout: { x: -300, y: 100 } });
    const https = await element({ type: 'data_flow', name: text(next('elements')), source_element_id: browser.id, target_element_id: api.id });
    const sql = await element({ type: 'data_flow', name: text(next('elements')), source_element_id: api.id, target_element_id: db.id });

    const threatOn = async (elementId: string | null, category: string): Promise<ApiRecord> =>
      (
        await c.post<ApiRecord>('/threats', {
          threat_model_id: model.id,
          element_id: elementId,
          category,
          title: text(next('threats')),
          description: 'A description',
          likelihood: 'Medium',
          impact: 'High',
          origin: 'manual',
        })
      ).body;
    const onApi = await threatOn(api.id, 'Spoofing');
    await threatOn(db.id, 'Tampering');
    await threatOn(browser.id, 'Spoofing');
    await threatOn(outer.id, 'Elevation of Privilege');
    await threatOn(sql.id, 'Tampering');
    await threatOn(https.id, 'Information Disclosure');
    await threatOn(null, 'Denial of Service');
    await threatOn(null, 'Repudiation');
    for (const status of ['proposed', 'implemented', 'verified']) {
      await c.post('/mitigations', { threat_id: onApi.id, description: text(next('mitigations')), status });
    }
    return { id: model.id, markers };
  }

  beforeAll(async () => {
    server = await startTestServer(app);
    token = await login(server.baseUrl);
    c = client(server.baseUrl, token);
    const seeded = await seed('Payments API', (marker) => `Item ${marker}`);
    modelId = seeded.id;
    markers = seeded.markers;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('format=markdown', () => {
    it('answers a Markdown attachment that nothing may keep (FR-001, FR-017)', async () => {
      const res = await report(modelId, '?format=markdown');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="payments-api-report-\d{4}-\d{2}-\d{2}\.md"$/);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect((await res.text()).startsWith('# Threat model report: Payments API\n')).toBe(true);
    });

    it('names the file after the UTC date, the one in the report’s own header', async () => {
      const res = await report(modelId, '?format=markdown');
      const body = await res.text();
      const date = /filename="[^"]*-(\d{4}-\d{2}-\d{2})\.md"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
      expect(body).toContain(`- **Exported:** ${date} `);
    });
  });

  describe('format=html', () => {
    it('answers an HTML attachment that nothing may keep, under a policy that runs nothing (FR-016)', async () => {
      const res = await report(modelId, '?format=html');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="payments-api-report-\d{4}-\d{2}-\d{2}\.html"$/);
      expect(res.headers.get('cache-control')).toBe('no-store');
      // It replaces the app's policy on this response, and only this one.
      expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect((await res.text()).startsWith('<!doctype html>\n')).toBe(true);
    });

    it('leaves the app’s own policy on every other answer, a download in Markdown included', async () => {
      const json = await fetch(`${server.baseUrl}/api/v1/threat-models/${modelId}`, { headers: { Authorization: `Bearer ${token}` } });
      const markdown = await report(modelId, '?format=markdown');
      for (const res of [json, markdown]) expect(res.headers.get('content-security-policy')).toContain("default-src 'none'; script-src 'self'");
    });

    it('has every threat and mitigation exactly once outside the picture, and a section for every element (SC-002)', async () => {
      const body = (await (await report(modelId, '?format=html')).text()).replace(/<svg[\s\S]*?<\/svg>/g, '');
      for (const marker of [...markers.threats, ...markers.mitigations]) expect(count(body, marker), marker).toBe(1);
      for (const marker of markers.elements) {
        const sections = [...body.matchAll(/<h([34])>E\d+ · [^<]*<\/h\1>/g)].filter((match) => match[0].endsWith(`${marker}</h${match[1]}>`));
        expect(sections, marker).toHaveLength(1);
      }
    });

    it('differs between two exports only in the export time (FR-013)', async () => {
      const [a, b] = await Promise.all([report(modelId, '?format=html').then((r) => r.text()), report(modelId, '?format=html').then((r) => r.text())]);
      const withoutStamp = (text: string): string[] => text.split('\n').filter((line) => !line.includes('<dt>Exported</dt>'));
      expect(withoutStamp(a)).toEqual(withoutStamp(b));
    });

    it('says the same as the Markdown report: the same threats in the same order', async () => {
      const [markdown, html] = await Promise.all([report(modelId, '?format=markdown').then((r) => r.text()), report(modelId, '?format=html').then((r) => r.text())]);
      const inMarkdown = [...markdown.matchAll(/^##### (Item Tmk\d{4}) — /gm)].map((match) => match[1]);
      const inHtml = [...html.replace(/<svg[\s\S]*?<\/svg>/g, '').matchAll(/<h5>(Item Tmk\d{4}) — /g)].map((match) => match[1]);
      expect(inHtml).toEqual(inMarkdown);
      expect(inHtml.length).toBe(markers.threats.length);
    });
  });

  describe('what is asked for', () => {
    it.each([
      ['no format', ''],
      ['an unknown format', '?format=pdf'],
      ['an empty format', '?format='],
      ['a repeated format', '?format=markdown&format=markdown'],
      ['an extra parameter', '?format=markdown&page=2'],
    ])('refuses %s with a 400 that names the formats', async (_name, query) => {
      const res = await report(modelId, query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(FORMAT_REFUSED);
    });

    it('checks the id, then the format, then whether the threat model exists', async () => {
      const bad = await report('not-a-uuid', '?format=pdf');
      expect([bad.status, await bad.json()]).toEqual([400, { error: 'Invalid id' }]);
      const unknownWithBadFormat = await report(randomUUID(), '?format=pdf');
      expect([unknownWithBadFormat.status, await unknownWithBadFormat.json()]).toEqual([400, FORMAT_REFUSED]);
      const unknown = await report(randomUUID(), '?format=markdown');
      expect([unknown.status, await unknown.json()]).toEqual([404, { error: 'Threat model not found' }]);
    });
  });

  describe('who may ask', () => {
    it('answers 401 without a token and with a bad one', async () => {
      const none = await report(modelId, '?format=markdown', null);
      expect([none.status, await none.json()]).toEqual([401, { error: 'Authentication required' }]);
      const bad = await report(modelId, '?format=markdown', 'not.a.token');
      expect([bad.status, await bad.json()]).toEqual([401, { error: 'Invalid or expired token' }]);
    });
  });

  describe('what the report holds', () => {
    it('has every threat and mitigation exactly once, and a section for every element (SC-002)', async () => {
      const body = await (await report(modelId, '?format=markdown')).text();
      for (const marker of [...markers.threats, ...markers.mitigations]) expect(count(body, marker), marker).toBe(1);
      // Element names are also quoted where a flow names its ends, and a nested boundary's heading carries the path of
      // the ones around it. A section is the heading that ends with the element's own name.
      for (const marker of markers.elements) {
        const sections = body.split('\n').filter((line) => /^#{3,4} E\d+ · /.test(line) && line.endsWith(marker));
        expect(sections, marker).toHaveLength(1);
      }
    });

    it('differs between two exports only in the export time (FR-013)', async () => {
      const [a, b] = await Promise.all([report(modelId, '?format=markdown').then((r) => r.text()), report(modelId, '?format=markdown').then((r) => r.text())]);
      const withoutStamp = (text: string): string[] => text.split('\n').filter((line) => !line.startsWith('- **Exported:**'));
      expect(withoutStamp(a)).toEqual(withoutStamp(b));
    });

    it('groups elements by trust boundary and puts the model-level threats last', async () => {
      const body = await (await report(modelId, '?format=markdown')).text();
      const headings = body.split('\n').filter((line) => /^#{2,4} /.test(line));
      expect(headings.findIndex((h) => h.startsWith('### E1 · Trust boundary · '))).toBeGreaterThan(-1);
      expect(headings.some((h) => h.startsWith('### E') && h.includes('›'))).toBe(true);
      expect(headings.at(-1)).toBe('## Threats not linked to an element');
    });
  });

  describe('what it leaves alone', () => {
    it('changes no record and writes no log line (FR-017)', async () => {
      const lists = async () => [
        (await c.get(`/threat-models/${modelId}/elements`)).body,
        (await c.get(`/threat-models/${modelId}/threats`)).body,
        (await c.get(`/threat-models/${modelId}/mitigations`)).body,
      ];
      const before = await lists();
      const log = captureWriteLog();
      try {
        await (await report(modelId, '?format=markdown')).text();
        expect(log.lines()).toEqual([]);
      } finally {
        log.restore();
      }
      expect(await lists()).toEqual(before);
    });

    it('never logs what is in a report (FR-018)', async () => {
      const secret = 'Zq9HostileSecret';
      const { id } = await seed(secret, (marker) => `${secret} ${marker}`);
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
      try {
        await (await report(id, '?format=markdown')).text();
        await (await report(id, '?format=pdf')).text();
        await (await report(randomUUID(), '?format=markdown')).text();
        vi.mocked(renderMarkdown).mockImplementationOnce(() => {
          throw new Error('the renderer failed');
        });
        const failed = await report(id, '?format=markdown');
        expect(failed.status).toBe(500);
        expect(await failed.json()).toEqual({ error: 'Internal server error' });
        const printed = spies.flatMap((spy) => spy.mock.calls.flat().map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))));
        expect(printed.join('\n')).not.toContain(secret);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });
});
