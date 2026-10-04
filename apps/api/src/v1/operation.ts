import { formatValidationError, uuid } from '@specter/core';
import type { z } from 'zod';
import { HttpError } from './errors.js';
import type { RecordType } from './write-log.js';

// Every list operation states its order in the OpenAPI document (FR-003).
export const LIST_ORDER_DESCRIPTION = 'Oldest first by creation time; ties broken by id.';

export type Method = 'get' | 'post' | 'patch' | 'delete';

interface OperationContext<B> {
  // The :id path parameter, already validated. Empty for a path that has none.
  id: string;
  // The request body, already parsed with the operation's schema.
  body: B;
  accountId: number;
}

// One API operation. The router mounts exactly these and the OpenAPI document describes exactly
// these, so the two cannot disagree (research #3).
export interface Operation<B = never> {
  method: Method;
  // Express style, relative to the /api/v1 mount: '/projects/:id'.
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  // `name` is the schema's component name in the OpenAPI document.
  body?: { name: string; schema: z.ZodType<B> };
  response?: { name: string; schema: z.ZodType; list?: boolean };
  status: 200 | 201 | 204;
  // Error statuses to document, besides 401 and 500 (every operation) and 400 and 413 (every body).
  errors: number[];
  // Set on every create, update and delete: it is what gets written to the write log.
  recordType?: RecordType;
  handler(ctx: OperationContext<B>): Promise<unknown>;
}

// Lets a resource file declare an operation with its body type inferred, in an array of them.
export function defineOperation<B = never>(operation: Operation<B>): Operation<unknown> {
  return operation;
}

export function parseId(raw: unknown): string {
  const result = uuid.safeParse(raw);
  if (!result.success) throw new HttpError(400, 'Invalid id');
  return result.data;
}

// An update needs at least one field (FR-006).
export function parseBody<B>(schema: z.ZodType<B>, raw: unknown, update: boolean): B {
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(400, formatValidationError(result.error));
  if (update && Object.keys(result.data as object).length === 0) {
    throw new HttpError(400, 'No updatable fields provided');
  }
  return result.data;
}
