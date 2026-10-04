import { describe, expect, it } from 'vitest';
import { ApiError, mapServerError } from './errors.js';

const FIELDS = ['name', 'description'];

describe('ApiError', () => {
  it('carries the status and the server message', () => {
    const err = new ApiError(409, 'A project with this name already exists');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.message).toBe('A project with this name already exists');
  });
});

describe('mapServerError()', () => {
  it('maps each "<field>: <message>" clause of core’s formatter to its field', () => {
    expect(mapServerError('name: Too long; description: Too long', FIELDS)).toEqual({
      fields: { name: 'Too long', description: 'Too long' },
      form: null,
    });
  });

  it('keeps a colon inside the message', () => {
    expect(mapServerError('name: Invalid input: expected string', FIELDS).fields).toEqual({
      name: 'Invalid input: expected string',
    });
  });

  it('puts an unknown-field clause and any unmatched clause in the form error', () => {
    expect(mapServerError('unknown field "origin"; name: Too long', FIELDS)).toEqual({
      fields: { name: 'Too long' },
      form: 'unknown field "origin"',
    });
  });

  it('puts a clause naming a field the form does not have in the form error', () => {
    expect(mapServerError('status: Invalid option', FIELDS)).toEqual({ fields: {}, form: 'status: Invalid option' });
  });

  it.each([
    'A project with this name already exists',
    'A threat model with this name already exists in this project',
  ])('maps the storage message %j to the name field', (message) => {
    expect(mapServerError(message, FIELDS)).toEqual({ fields: { name: message }, form: null });
  });

  it('sends a storage message to the form when there is no name field', () => {
    expect(mapServerError('A project with this name already exists', ['title'])).toEqual({
      fields: {},
      form: 'A project with this name already exists',
    });
  });

  it('puts a message with no field at all in the form error', () => {
    expect(mapServerError('Internal server error', FIELDS)).toEqual({ fields: {}, form: 'Internal server error' });
  });
});
