import { MitigationRecord, ThreatCreateInput, ThreatRecord, ThreatUpdateInput } from '@specter/core';
import { z } from 'zod';
import { kdb } from '../db.js';
import { orNotFound } from './errors.js';
import { LIST_ORDER_DESCRIPTION, defineOperation, type Operation } from './operation.js';

// Through the API a threat is always manual. Core's schema also allows "rule" and "ai" for the rule
// engine (Phase 2) and AI drafts (Phase 3), which write on the server's behalf: letting a client claim
// either would fake provenance (FR-009, Principles V and VI). As in core, origin has no default.
const ThreatCreateInputV1 = ThreatCreateInput.extend({ origin: z.literal('manual') });

export const threatOperations: Operation<unknown>[] = [
  defineOperation({
    method: 'post',
    path: '/threats',
    operationId: 'createThreat',
    summary: 'Create a threat for a threat model, or for one of its elements',
    description: 'origin is required and must be "manual". Risk is derived from likelihood and impact.',
    body: { name: 'ThreatCreateInput', schema: ThreatCreateInputV1 },
    response: { name: 'ThreatRecord', schema: ThreatRecord },
    status: 201,
    errors: [400],
    recordType: 'threat',
    handler: ({ body }) => kdb.insertInto('threats').values(body).returningAll().executeTakeFirstOrThrow(),
  }),
  defineOperation({
    method: 'get',
    path: '/threats/:id',
    operationId: 'getThreat',
    summary: 'Get one threat',
    response: { name: 'ThreatRecord', schema: ThreatRecord },
    status: 200,
    errors: [400, 404],
    handler: async ({ id }) =>
      orNotFound(await kdb.selectFrom('threats').selectAll().where('id', '=', id).executeTakeFirst(), 'Threat'),
  }),
  defineOperation({
    method: 'patch',
    path: '/threats/:id',
    operationId: 'updateThreat',
    summary: 'Update the fields sent; the others stay as they are',
    description: 'Any status can be set at any time, in any direction. origin cannot be changed.',
    body: { name: 'ThreatUpdateInput', schema: ThreatUpdateInput },
    response: { name: 'ThreatRecord', schema: ThreatRecord },
    status: 200,
    errors: [400, 404],
    recordType: 'threat',
    handler: async ({ id, body }) =>
      orNotFound(
        await kdb.updateTable('threats').set(body).where('id', '=', id).returningAll().executeTakeFirst(),
        'Threat',
      ),
  }),
  defineOperation({
    method: 'delete',
    path: '/threats/:id',
    operationId: 'deleteThreat',
    summary: 'Delete a threat and its mitigations',
    status: 204,
    errors: [400, 404],
    recordType: 'threat',
    handler: async ({ id }) =>
      orNotFound(await kdb.deleteFrom('threats').where('id', '=', id).returning('id').executeTakeFirst(), 'Threat'),
  }),
  defineOperation({
    method: 'get',
    path: '/threats/:id/mitigations',
    operationId: 'listThreatMitigations',
    summary: 'List the mitigations of one threat',
    description: LIST_ORDER_DESCRIPTION,
    response: { name: 'MitigationRecord', schema: MitigationRecord, list: true },
    status: 200,
    errors: [400, 404],
    handler: async ({ id }) => {
      orNotFound(await kdb.selectFrom('threats').select('id').where('id', '=', id).executeTakeFirst(), 'Threat');
      return kdb
        .selectFrom('mitigations')
        .selectAll()
        .where('threat_id', '=', id)
        .orderBy('created_at')
        .orderBy('id')
        .execute();
    },
  }),
];
