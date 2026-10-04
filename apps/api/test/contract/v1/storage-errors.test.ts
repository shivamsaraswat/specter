import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../../../src/app.js';
import { HttpError, mapStorageError } from '../../../src/v1/errors.js';
import { login, startTestServer, type TestServer } from '../helpers.js';
import { captureWriteLog, client, seedChain, uniqueName, type ApiRecord, type Chain, type V1Client } from './helpers.js';

// Every row of contracts/v1-api.md "Storage errors": a rule only the database can check, answered
// with a fixed status and message instead of a 500 (FR-013, SC-003). The messages are copied from
// the contract, so a reworded one fails here.

const MESSAGES = {
  projectName: 'A project with this name already exists',
  modelName: 'A threat model with this name already exists in this project',
  elementHasThreats:
    'This element still has threats, or data flows that would be deleted with it have threats; delete or reassign those threats first',
  threatElement: 'element_id must refer to an element in the same threat model',
  flowSource: 'source_element_id must refer to an element in the same threat model',
  flowTarget: 'target_element_id must refer to an element in the same threat model',
  parentMissing: 'parent_boundary_id must refer to an existing element',
  noProject: 'project_id does not match an existing project',
  noModel: 'threat_model_id does not match an existing threat model',
  noThreat: 'threat_id does not match an existing threat',
  token: 'Invalid or expired token',
  flowEndpoints: 'A data flow needs source_element_id and target_element_id, and other element types must have neither',
  selfLoop: 'A data flow cannot start and end at the same element',
  flowParent: 'A data flow cannot have a parent_boundary_id',
  parentSelf: 'An element cannot be its own parent',
  endpointType: 'A data flow can only connect external entities, processes and data stores',
  parentBoundary: 'parent_boundary_id must refer to a trust boundary in the same threat model',
  cycle: 'Trust boundaries cannot contain each other in a cycle',
  typeClass:
    "An element's type can only change within its class: node types among themselves, never to or from data_flow or trust_boundary",
  moved: 'A record cannot be moved to another parent',
  origin: 'origin cannot change',
  backstop: 'The request breaks a data rule',
};

describe('mapStorageError, row by row', () => {
  const rows: [code: string, constraint: string | undefined, operation: 'write' | 'delete', status: number, message: string][] = [
    ['23505', 'projects_name_key', 'write', 409, MESSAGES.projectName],
    ['23505', 'threat_models_name_key', 'write', 409, MESSAGES.modelName],
    ['23503', 'threats_element_fkey', 'delete', 409, MESSAGES.elementHasThreats],
    ['23503', 'threats_element_fkey', 'write', 400, MESSAGES.threatElement],
    ['23503', 'elements_source_fkey', 'write', 400, MESSAGES.flowSource],
    ['23503', 'elements_target_fkey', 'write', 400, MESSAGES.flowTarget],
    ['23503', 'elements_parent_fkey', 'write', 400, MESSAGES.parentMissing],
    ['23503', 'threat_models_project_id_fkey', 'write', 400, MESSAGES.noProject],
    ['23503', 'elements_threat_model_id_fkey', 'write', 400, MESSAGES.noModel],
    ['23503', 'threats_threat_model_id_fkey', 'write', 400, MESSAGES.noModel],
    ['23503', 'mitigations_threat_id_fkey', 'write', 400, MESSAGES.noThreat],
    ['23503', 'projects_created_by_fkey', 'write', 401, MESSAGES.token],
    ['23514', 'elements_flow_endpoints', 'write', 400, MESSAGES.flowEndpoints],
    ['23514', 'elements_flow_not_self_loop', 'write', 400, MESSAGES.selfLoop],
    ['23514', 'elements_flow_no_parent', 'write', 400, MESSAGES.flowParent],
    ['23514', 'elements_parent_not_self', 'write', 400, MESSAGES.parentSelf],
    ['23514', 'elements_flow_endpoint_type', 'write', 400, MESSAGES.endpointType],
    ['23514', 'elements_parent_is_boundary', 'write', 400, MESSAGES.parentBoundary],
    ['23514', 'elements_boundary_no_cycle', 'write', 400, MESSAGES.cycle],
    ['23514', 'elements_type_class_immutable', 'write', 400, MESSAGES.typeClass],
    // Not reachable through v1, whose update schemas leave these fields out. Mapped anyway, so a
    // future schema change cannot turn them into a 500.
    ['23514', 'elements_threat_model_immutable', 'write', 400, MESSAGES.moved],
    ['23514', 'threats_threat_model_immutable', 'write', 400, MESSAGES.moved],
    ['23514', 'mitigations_threat_immutable', 'write', 400, MESSAGES.moved],
    ['23514', 'threats_origin_immutable', 'write', 400, MESSAGES.origin],
    // The backstops: rules the request schemas already enforce, so normally never reached.
    ['23514', 'threats_title_check', 'write', 400, MESSAGES.backstop],
    ['23502', undefined, 'write', 400, MESSAGES.backstop],
    ['428C9', undefined, 'write', 400, MESSAGES.backstop],
    ['22P02', undefined, 'write', 400, MESSAGES.backstop],
  ];

  it.each(rows)('%s %s on a %s is %i "%s"', (code, constraint, operation, status, message) => {
    const mapped = mapStorageError({ code, constraint, message: 'SECRET-DRIVER-MESSAGE', detail: 'SECRET-DETAIL' }, operation);
    expect(mapped).toBeInstanceOf(HttpError);
    expect(mapped).toMatchObject({ status, message });
  });

  it.each([
    ['an unknown SQLSTATE', { code: '42P01' }],
    ['an unknown unique constraint', { code: '23505', constraint: 'something_else_key' }],
    ['an unknown foreign key', { code: '23503', constraint: 'something_else_fkey' }],
    ['an ordinary error', new Error('boom')],
    ['a non-error', 'oops'],
    ['null', null],
  ])('does not claim %s, so it reaches the 500 handler', (_label, err) => {
    expect(mapStorageError(err, 'write')).toBeNull();
  });

  it('logs a backstop with its SQLSTATE and constraint, never the driver message or detail', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      mapStorageError({ code: '23514', constraint: 'threats_title_check', message: 'SECRET-DRIVER-MESSAGE', detail: 'SECRET-DETAIL' }, 'write');
      expect(warn).toHaveBeenCalledTimes(1);
      const printed = JSON.stringify(warn.mock.calls);
      expect(printed).toContain('23514');
      expect(printed).toContain('threats_title_check');
      expect(printed).not.toContain('SECRET');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('storage rules through the API', () => {
  let server: TestServer;
  let c: V1Client;
  let chain: Chain;

  beforeAll(async () => {
    server = await startTestServer(app);
    c = client(server.baseUrl, await login(server.baseUrl));
    chain = await seedChain(c);
  });

  afterAll(async () => {
    await server.close();
  });

  const rejected = (error: string, status = 400) => ({ status, body: { error } });
  const element = (overrides: Record<string, unknown>) => ({
    threat_model_id: chain.model.id,
    type: 'process',
    name: 'E',
    ...overrides,
  });
  const sizeOf = async (path: string) => (await c.get<ApiRecord[]>(path)).body.length;
  // The test database is shared with files running in parallel, so "nothing was written" is checked
  // by name, never by the size of the whole project list.
  const projectsNamed = async (name: string) =>
    (await c.get<ApiRecord[]>('/projects')).body.filter((p) => (p.name as string).trim().toLowerCase() === name.trim().toLowerCase())
      .length;

  async function otherModel(): Promise<{ model: ApiRecord; node: ApiRecord }> {
    const project = (await c.post<ApiRecord>('/projects', { name: uniqueName('Other') })).body;
    const model = (await c.post<ApiRecord>('/threat-models', { project_id: project.id, name: 'Other' })).body;
    const node = (await c.post<ApiRecord>('/elements', { threat_model_id: model.id, type: 'process', name: 'Elsewhere' }))
      .body;
    return { model, node };
  }

  describe('duplicate names (409)', () => {
    it('rejects a project name that is taken, ignoring case and surrounding spaces', async () => {
      const name = uniqueName('Payments');
      expect((await c.post('/projects', { name })).status).toBe(201);
      expect(await c.post('/projects', { name: `  ${name.toUpperCase()} ` })).toEqual(rejected(MESSAGES.projectName, 409));
      expect(await projectsNamed(name)).toBe(1);
    });

    it('rejects renaming a project to a name that is taken', async () => {
      const taken = (await c.post<ApiRecord>('/projects', { name: uniqueName('Taken') })).body;
      const other = (await c.post<ApiRecord>('/projects', { name: uniqueName('Other') })).body;
      const res = await c.patch(`/projects/${other.id}`, { name: taken.name });
      expect(res).toEqual(rejected(MESSAGES.projectName, 409));
    });

    it('rejects a threat model name that is taken in the same project, but not in another', async () => {
      const first = await c.post('/threat-models', { project_id: chain.project.id, name: 'Duplicate' });
      expect(first.status).toBe(201);
      expect(await c.post('/threat-models', { project_id: chain.project.id, name: ' duplicate ' })).toEqual(
        rejected(MESSAGES.modelName, 409),
      );
      const { model } = await otherModel();
      expect((await c.post('/threat-models', { project_id: model.project_id, name: 'Duplicate' })).status).toBe(201);
    });

    it('rejects renaming a threat model to a name that is taken in its project', async () => {
      const a = (await c.post<ApiRecord>('/threat-models', { project_id: chain.project.id, name: uniqueName('A') })).body;
      const b = (await c.post<ApiRecord>('/threat-models', { project_id: chain.project.id, name: uniqueName('B') })).body;
      expect(await c.patch(`/threat-models/${b.id}`, { name: a.name })).toEqual(rejected(MESSAGES.modelName, 409));
    });
  });

  describe('deleting an element that still has threats (409)', () => {
    it('is rejected, and nothing is removed', async () => {
      const before = await sizeOf(`/threat-models/${chain.model.id}/elements`);
      expect(await c.del(`/elements/${chain.nodeA.id}`)).toEqual(rejected(MESSAGES.elementHasThreats, 409));
      expect(await sizeOf(`/threat-models/${chain.model.id}/elements`)).toBe(before);
      expect((await c.get(`/elements/${chain.nodeA.id}`)).status).toBe(200);
    });

    it('is rejected when a data flow that would be deleted with it has threats', async () => {
      const a = (await c.post<ApiRecord>('/elements', element({ type: 'process', name: 'FlowA' }))).body;
      const b = (await c.post<ApiRecord>('/elements', element({ type: 'process', name: 'FlowB' }))).body;
      const flow = (
        await c.post<ApiRecord>('/elements', element({ type: 'data_flow', source_element_id: a.id, target_element_id: b.id }))
      ).body;
      await c.post('/threats', {
        threat_model_id: chain.model.id,
        element_id: flow.id,
        category: 'Tampering',
        title: 'On the flow',
        likelihood: 'Low',
        impact: 'Low',
        origin: 'manual',
      });
      expect(await c.del(`/elements/${a.id}`)).toEqual(rejected(MESSAGES.elementHasThreats, 409));
      expect((await c.get(`/elements/${flow.id}`)).status).toBe(200);
    });
  });

  describe('references that do not hold (400)', () => {
    it('rejects a threat whose element is in another threat model, or does not exist', async () => {
      const { node } = await otherModel();
      const body = (element_id: string) => ({
        threat_model_id: chain.model.id,
        element_id,
        category: 'Spoofing',
        title: 'Misplaced',
        likelihood: 'Low',
        impact: 'Low',
        origin: 'manual',
      });
      expect(await c.post('/threats', body(node.id))).toEqual(rejected(MESSAGES.threatElement));
      expect(await c.post('/threats', body(randomUUID()))).toEqual(rejected(MESSAGES.threatElement));
    });

    it('rejects a data flow whose source, or whose target, is in another threat model', async () => {
      const { node } = await otherModel();
      const flow = (source: string, target: string) =>
        element({ type: 'data_flow', source_element_id: source, target_element_id: target });
      expect(await c.post('/elements', flow(node.id, chain.nodeB.id))).toEqual(rejected(MESSAGES.flowSource));
      expect(await c.post('/elements', flow(chain.nodeA.id, node.id))).toEqual(rejected(MESSAGES.flowTarget));
    });

    it('rejects a parent that does not exist', async () => {
      expect(await c.post('/elements', element({ parent_boundary_id: randomUUID() }))).toEqual(
        rejected(MESSAGES.parentMissing),
      );
    });

    it('rejects a project, threat model or threat that does not exist', async () => {
      expect(await c.post('/threat-models', { project_id: randomUUID(), name: 'Orphan' })).toEqual(rejected(MESSAGES.noProject));
      expect(await c.post('/elements', element({ threat_model_id: randomUUID(), type: 'process' }))).toEqual(
        rejected(MESSAGES.noModel),
      );
      expect(
        await c.post('/threats', {
          threat_model_id: randomUUID(),
          category: 'Spoofing',
          title: 'Orphan',
          likelihood: 'Low',
          impact: 'Low',
          origin: 'manual',
        }),
      ).toEqual(rejected(MESSAGES.noModel));
      expect(await c.post('/mitigations', { threat_id: randomUUID(), description: 'Orphan' })).toEqual(
        rejected(MESSAGES.noThreat),
      );
    });
  });

  describe('the shape of an element (400)', () => {
    it('rejects a data flow without endpoints, and other types with endpoints', async () => {
      expect(await c.post('/elements', element({ type: 'data_flow' }))).toEqual(rejected(MESSAGES.flowEndpoints));
      expect(
        await c.post('/elements', element({ type: 'process', source_element_id: chain.nodeA.id, target_element_id: chain.nodeB.id })),
      ).toEqual(rejected(MESSAGES.flowEndpoints));
    });

    it('rejects a data flow that starts and ends at the same element', async () => {
      const flow = element({ type: 'data_flow', source_element_id: chain.nodeA.id, target_element_id: chain.nodeA.id });
      expect(await c.post('/elements', flow)).toEqual(rejected(MESSAGES.selfLoop));
    });

    it('rejects a data flow with a parent', async () => {
      const boundary = (await c.post<ApiRecord>('/elements', element({ type: 'trust_boundary', name: 'Zone' }))).body;
      const flow = element({
        type: 'data_flow',
        source_element_id: chain.nodeA.id,
        target_element_id: chain.nodeB.id,
        parent_boundary_id: boundary.id,
      });
      expect(await c.post('/elements', flow)).toEqual(rejected(MESSAGES.flowParent));
    });

    it('rejects a trust boundary that is its own parent', async () => {
      const boundary = (await c.post<ApiRecord>('/elements', element({ type: 'trust_boundary', name: 'Loop' }))).body;
      expect(await c.patch(`/elements/${boundary.id}`, { parent_boundary_id: boundary.id })).toEqual(
        rejected(MESSAGES.parentSelf),
      );
    });

    it('rejects a data flow endpoint that is a trust boundary', async () => {
      const boundary = (await c.post<ApiRecord>('/elements', element({ type: 'trust_boundary', name: 'Wall' }))).body;
      const flow = element({ type: 'data_flow', source_element_id: boundary.id, target_element_id: chain.nodeB.id });
      expect(await c.post('/elements', flow)).toEqual(rejected(MESSAGES.endpointType));
    });

    it('rejects a parent that is not a trust boundary, or is in another threat model', async () => {
      expect(await c.post('/elements', element({ parent_boundary_id: chain.nodeA.id }))).toEqual(
        rejected(MESSAGES.parentBoundary),
      );
      const { model } = await otherModel();
      const foreignBoundary = (
        await c.post<ApiRecord>('/elements', { threat_model_id: model.id, type: 'trust_boundary', name: 'Foreign' })
      ).body;
      expect(await c.post('/elements', element({ parent_boundary_id: foreignBoundary.id }))).toEqual(
        rejected(MESSAGES.parentBoundary),
      );
    });

    it('rejects trust boundaries that would contain each other in a cycle', async () => {
      const outer = (await c.post<ApiRecord>('/elements', element({ type: 'trust_boundary', name: 'Outer' }))).body;
      const inner = (
        await c.post<ApiRecord>('/elements', element({ type: 'trust_boundary', name: 'Inner', parent_boundary_id: outer.id }))
      ).body;
      expect(await c.patch(`/elements/${outer.id}`, { parent_boundary_id: inner.id })).toEqual(rejected(MESSAGES.cycle));
    });

    it('rejects changing an element between a node, a data flow and a trust boundary', async () => {
      expect(await c.patch(`/elements/${chain.nodeB.id}`, { type: 'data_flow' })).toEqual(rejected(MESSAGES.typeClass));
      expect(await c.patch(`/elements/${chain.nodeB.id}`, { type: 'trust_boundary' })).toEqual(rejected(MESSAGES.typeClass));
      expect((await c.patch(`/elements/${chain.nodeB.id}`, { type: 'data_store' })).status).toBe(200);
    });
  });

  describe('a token whose account does not exist (401)', () => {
    it('is not allowed to create a project', async () => {
      const ghost = jwt.sign({ sub: '2147480000', username: 'ghost' }, process.env.JWT_SECRET as string);
      const name = uniqueName('Ghost');
      const res = await client(server.baseUrl, ghost).post('/projects', { name });
      expect(res).toEqual(rejected(MESSAGES.token, 401));
      expect(await projectsNamed(name)).toBe(0);
    });
  });

  describe('what a rejected write leaves behind', () => {
    it('writes no log line', async () => {
      const log = captureWriteLog();
      try {
        expect((await c.del(`/elements/${chain.nodeA.id}`)).status).toBe(409);
        expect((await c.post('/projects', { name: chain.project.name })).status).toBe(409);
        expect(log.raw()).toEqual([]);
      } finally {
        log.restore();
      }
    });

    it('is never a 500', async () => {
      const responses = [
        await c.del(`/elements/${chain.nodeA.id}`),
        await c.post('/projects', { name: chain.project.name }),
        await c.post('/elements', element({ type: 'data_flow' })),
      ];
      expect(responses.map((r) => r.status)).toEqual([409, 409, 400]);
    });
  });
});
