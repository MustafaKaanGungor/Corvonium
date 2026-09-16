import type { Snapshot } from '@corvonium/shared';
import { itemSchema } from './items';
import { projectSchema } from './projects';
import { sessionSchema } from './sessions';

/**
 * Does a document from outside — a backup file — match the schema it would be
 * stored under?
 *
 * Production RxDB does not validate (the ajv validator is loaded in dev only, to
 * keep it out of the bundle), so without this a hand-edited or damaged file would
 * be stored as-is and break a screen later. The schemas in this folder are the
 * only definition of a field there is, so this reads them instead of restating
 * them: it covers the parts of JSON Schema those files actually use.
 */

type Node = {
  type?: string | readonly string[];
  enum?: readonly unknown[];
  properties?: Record<string, Node>;
  required?: readonly string[];
  items?: Node;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
};

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'not-a-number';
  return typeof value;
}

/** The first problem with `value`, or `null`. `path` names the field in the message. */
function check(node: Node, value: unknown, path: string): string | null {
  if (node.type !== undefined) {
    const allowed = typeof node.type === 'string' ? [node.type] : node.type;
    const actual = typeOf(value);
    const ok = allowed.includes(actual) || (actual === 'number' && allowed.includes('integer'));
    if (!ok) return `${path} should be ${allowed.join(' or ')}, not ${actual}`;
  }

  if (node.enum !== undefined && !node.enum.includes(value)) {
    return `${path} has an unknown value ${JSON.stringify(value)}`;
  }

  if (typeof value === 'string' && node.maxLength !== undefined && value.length > node.maxLength) {
    return `${path} is too long`;
  }

  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) return `${path} is out of range`;
    if (node.maximum !== undefined && value > node.maximum) return `${path} is out of range`;
  }

  if (Array.isArray(value) && node.items !== undefined) {
    for (const [index, entry] of value.entries()) {
      const problem = check(node.items, entry, `${path}[${index}]`);
      if (problem !== null) return problem;
    }
  }

  if (node.properties !== undefined && typeOf(value) === 'object') {
    const record = value as Record<string, unknown>;

    for (const field of node.required ?? []) {
      if (!(field in record)) return `${path}.${field} is missing`;
    }

    for (const [field, entry] of Object.entries(record)) {
      const child = node.properties[field];
      // Unknown fields are refused too: they would be stored and never read.
      if (child === undefined) return `${path}.${field} is not a known field`;
      const problem = check(child, entry, `${path}.${field}`);
      if (problem !== null) return problem;
    }
  }

  return null;
}

const SCHEMAS: Record<keyof Snapshot, Node> = {
  items: itemSchema as Node,
  projects: projectSchema as Node,
  sessions: sessionSchema as Node,
};

const SINGULAR: Record<keyof Snapshot, string> = {
  items: 'item',
  projects: 'project',
  sessions: 'session',
};

/**
 * The first document in the snapshot that would not fit, described for a person,
 * or `null` when every one does.
 */
export function checkDocuments(snapshot: Snapshot): string | null {
  for (const name of Object.keys(SCHEMAS) as (keyof Snapshot)[]) {
    for (const doc of snapshot[name]) {
      const label =
        'title' in doc ? `“${doc.title}”` : 'name' in doc ? `“${doc.name}”` : doc.id.slice(0, 8);
      const problem = check(SCHEMAS[name], doc, SINGULAR[name]);
      if (problem !== null) {
        return `This backup is damaged: the ${SINGULAR[name]} ${label} doesn't fit (${problem}).`;
      }
    }
  }
  return null;
}
