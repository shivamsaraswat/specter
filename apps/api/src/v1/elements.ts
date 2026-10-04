import { ElementCreateInput, ElementRecord, ElementUpdateInput } from '@specter/core';
import { kdb } from '../db.js';
import { orNotFound } from './errors.js';
import { defineOperation, type Operation } from './operation.js';

export const elementOperations: Operation<unknown>[] = [
  defineOperation({
    method: 'post',
    path: '/elements',
    operationId: 'createElement',
    summary: 'Create a diagram element in a threat model',
    body: { name: 'ElementCreateInput', schema: ElementCreateInput },
    response: { name: 'ElementRecord', schema: ElementRecord },
    status: 201,
    errors: [400],
    recordType: 'element',
    handler: ({ body }) => kdb.insertInto('elements').values(body).returningAll().executeTakeFirstOrThrow(),
  }),
  defineOperation({
    method: 'get',
    path: '/elements/:id',
    operationId: 'getElement',
    summary: 'Get one element',
    response: { name: 'ElementRecord', schema: ElementRecord },
    status: 200,
    errors: [400, 404],
    handler: async ({ id }) =>
      orNotFound(await kdb.selectFrom('elements').selectAll().where('id', '=', id).executeTakeFirst(), 'Element'),
  }),
  defineOperation({
    method: 'patch',
    path: '/elements/:id',
    operationId: 'updateElement',
    summary: 'Update the fields sent; the others stay as they are',
    body: { name: 'ElementUpdateInput', schema: ElementUpdateInput },
    response: { name: 'ElementRecord', schema: ElementRecord },
    status: 200,
    errors: [400, 404],
    recordType: 'element',
    handler: async ({ id, body }) =>
      orNotFound(
        await kdb.updateTable('elements').set(body).where('id', '=', id).returningAll().executeTakeFirst(),
        'Element',
      ),
  }),
  defineOperation({
    method: 'delete',
    path: '/elements/:id',
    operationId: 'deleteElement',
    summary: 'Delete an element, along with the data flows that use it',
    description: 'Rejected while the element, or a data flow deleted with it, still has threats.',
    status: 204,
    errors: [400, 404, 409],
    recordType: 'element',
    handler: async ({ id }) =>
      orNotFound(await kdb.deleteFrom('elements').where('id', '=', id).returning('id').executeTakeFirst(), 'Element'),
  }),
];
