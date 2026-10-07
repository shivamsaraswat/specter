// A failure with a status and a message that is safe to send to the client. Messages are fixed
// strings, never built from request input or stored values (FR-012).
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// A query that found no row answers 404, naming the entity ("Project not found"). The bare "Not
// found" is reserved for paths the app does not serve, so the two can be told apart.
export function orNotFound<T>(row: T | undefined, entity: string): T {
  if (row === undefined) throw new HttpError(404, `${entity} not found`);
  return row;
}

const BACKSTOP_MESSAGE = 'The request breaks a data rule';
const MOVED_MESSAGE = 'A record cannot be moved to another parent';

// 23505: a name is taken.
const DUPLICATES: Record<string, string> = {
  projects_name_key: 'A project with this name already exists',
  threat_models_name_key: 'A threat model with this name already exists in this project',
};

// 23503 on a create or update: a reference that does not hold.
const BAD_REFERENCES: Record<string, string> = {
  threats_element_fkey: 'element_id must refer to an element in the same threat model',
  elements_source_fkey: 'source_element_id must refer to an element in the same threat model',
  elements_target_fkey: 'target_element_id must refer to an element in the same threat model',
  elements_parent_fkey: 'parent_boundary_id must refer to an existing element',
  threat_models_project_id_fkey: 'project_id does not match an existing project',
  elements_threat_model_id_fkey: 'threat_model_id does not match an existing threat model',
  threats_threat_model_id_fkey: 'threat_model_id does not match an existing threat model',
  mitigations_threat_id_fkey: 'threat_id does not match an existing threat',
};

// 23514: a rule on the shape of a record, raised by a CHECK or by one of M3's triggers.
const BROKEN_RULES: Record<string, string> = {
  elements_flow_endpoints:
    'A data flow needs source_element_id and target_element_id, and other element types must have neither',
  elements_flow_not_self_loop: 'A data flow cannot start and end at the same element',
  elements_flow_no_parent: 'A data flow cannot have a parent_boundary_id',
  elements_parent_not_self: 'An element cannot be its own parent',
  elements_flow_endpoint_type: 'A data flow can only connect external entities, processes and data stores',
  elements_parent_is_boundary: 'parent_boundary_id must refer to a trust boundary in the same threat model',
  elements_boundary_no_cycle: 'Trust boundaries cannot contain each other in a cycle',
  elements_type_class_immutable:
    "An element's type can only change within its class: node types among themselves, never to or from data_flow or trust_boundary",
  // The v1 update schemas leave these fields out, so no request reaches them. They are mapped anyway,
  // so a later change to a schema cannot turn them into a 500.
  elements_threat_model_immutable: MOVED_MESSAGE,
  threats_threat_model_immutable: MOVED_MESSAGE,
  mitigations_threat_immutable: MOVED_MESSAGE,
  threats_origin_immutable: 'origin cannot change',
};

const ELEMENT_HAS_THREATS =
  'This element still has threats, or data flows that would be deleted with it have threats; delete or reassign those threats first';

// An own property only: a constraint name is data from the driver, and "constructor" is not a rule.
function lookup(table: Record<string, string>, key: string | undefined): string | undefined {
  return key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
}

// Maps a Postgres rule violation to the response in specs/phase-1/milestone-5-rest-api-v1/contracts/v1-api.md
// ("Storage errors"), keyed on SQLSTATE and constraint name only. The driver's own message and
// detail can contain row values, so they are never read. Returns null for anything not recognised,
// which the router rethrows to the app's 500 handler.
export function mapStorageError(err: unknown, operation: 'write' | 'delete'): HttpError | null {
  if (typeof err !== 'object' || err === null) return null;
  const { code, constraint: rawConstraint } = err as { code?: unknown; constraint?: unknown };
  if (typeof code !== 'string') return null;
  const constraint = typeof rawConstraint === 'string' ? rawConstraint : undefined;

  if (code === '23505') {
    const message = lookup(DUPLICATES, constraint);
    return message === undefined ? null : new HttpError(409, message);
  }

  if (code === '23503') {
    if (operation === 'delete') {
      return constraint === 'threats_element_fkey' ? new HttpError(409, ELEMENT_HAS_THREATS) : null;
    }
    // A token whose account is gone cannot own a new project.
    if (constraint === 'projects_created_by_fkey') return new HttpError(401, 'Invalid or expired token');
    const message = lookup(BAD_REFERENCES, constraint);
    return message === undefined ? null : new HttpError(400, message);
  }

  if (code === '23514') {
    const message = lookup(BROKEN_RULES, constraint);
    if (message !== undefined) return new HttpError(400, message);
  }

  // The request schemas enforce these rules first, so reaching one means a gap in them. It is
  // answered, not left as a 500, and logged by code and constraint name so the gap can be found.
  if (code === '23514' || code === '23502' || code === '428C9' || code === '22P02') {
    console.warn('Storage rule backstop', { code, constraint });
    return new HttpError(400, BACKSTOP_MESSAGE);
  }

  return null;
}
