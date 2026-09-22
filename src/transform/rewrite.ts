import MagicString from 'magic-string';
import { parseSync, visitorKeys } from 'oxc-parser';
import {
  ENCODE_LOCAL,
  ENCODE_RESULT_LOCAL,
  RUNTIME_IMPORT,
  VIRTUAL_RUNTIME,
} from './names.js';

export interface RewriteOptions {
  /** Extra call expressions to treat as data sources, e.g. `client.query`. */
  sources?: string[];
}

export interface RewriteResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  /** Call sites wrapped, for tests and for the plugin's debug logging. */
  wrapped: number;
}

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

type Wrapper = typeof ENCODE_LOCAL | typeof ENCODE_RESULT_LOCAL;

const LANGS: Record<string, 'js' | 'jsx' | 'ts' | 'tsx'> = {
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  ts: 'ts',
  mts: 'ts',
  tsx: 'tsx',
  astro: 'js',
};

export function langFor(id: string): 'js' | 'jsx' | 'ts' | 'tsx' | null {
  const extension = id.split('?')[0]!.split('.').pop()?.toLowerCase();
  return extension ? (LANGS[extension] ?? null) : null;
}

/** Cheap pre-test so most files never reach the parser. */
export function mightMatch(code: string, sources: string[] = []): boolean {
  if (code.includes('.json(')) return true;
  for (const source of sources) {
    if (code.includes(lastSegment(source))) return true;
  }
  return false;
}

export function rewrite(id: string, code: string, options: RewriteOptions = {}): RewriteResult | null {
  const sources = options.sources ?? [];
  if (!mightMatch(code, sources)) return null;
  if (code.includes(VIRTUAL_RUNTIME)) return null;

  const lang = langFor(id);
  if (lang === null) return null;

  const parsed = parseSync(id, code, { sourceType: 'module', lang, range: false });
  if (parsed.errors.length > 0) return null;

  const targets: Array<{ node: Node; wrapper: Wrapper }> = [];
  const alreadyWrapped = new Set<Node>();

  walk(parsed.program as unknown as Node, (node) => {
    if (node.type !== 'CallExpression') return;
    const call = node as Node & { callee: Node; arguments: Node[] };

    const calleeName = dottedName(call.callee);
    if (calleeName === ENCODE_LOCAL || calleeName === ENCODE_RESULT_LOCAL) {
      const inner = call.arguments[0];
      if (inner) alreadyWrapped.add(inner);
      return;
    }

    if (isJsonCall(call)) {
      targets.push({ node, wrapper: ENCODE_LOCAL });
      return;
    }
    if (calleeName !== null && matchesSource(calleeName, sources)) {
      targets.push({ node, wrapper: ENCODE_RESULT_LOCAL });
    }
  });

  const pending = targets.filter((target) => !alreadyWrapped.has(target.node));
  if (pending.length === 0) return null;

  const magic = new MagicString(code);
  for (const { node, wrapper } of pending) {
    magic.appendLeft(node.start, `${wrapper}(`);
    magic.appendRight(node.end, ')');
  }
  magic.prepend(RUNTIME_IMPORT);

  return {
    code: magic.toString(),
    map: magic.generateMap({ source: id, includeContent: true, hires: true }),
    wrapped: pending.length,
  };
}

function isJsonCall(call: Node & { callee: Node; arguments: Node[] }): boolean {
  if (call.arguments.length !== 0) return false;
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (callee.computed === true) return false;
  const property = callee.property as Node | undefined;
  return property?.type === 'Identifier' && property.name === 'json';
}

/**
 * A source is matched on its full dotted path or on its tail, so `client.query`
 * in the config also covers `this.client.query` and `deps.client.query`.
 */
function matchesSource(name: string, sources: string[]): boolean {
  for (const source of sources) {
    if (name === source || name.endsWith(`.${source}`)) return true;
  }
  return false;
}

function dottedName(node: Node): string | null {
  if (node.type === 'Identifier') return node.name as string;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type !== 'MemberExpression' || node.computed === true) return null;
  const property = node.property as Node;
  if (property.type !== 'Identifier') return null;
  const object = dottedName(node.object as Node);
  return object === null ? null : `${object}.${property.name as string}`;
}

function lastSegment(source: string): string {
  const at = source.lastIndexOf('.');
  return at === -1 ? source : source.slice(at + 1);
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  const keys = visitorKeys[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = node[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') walk(item as Node, visit);
      }
    } else if (typeof child === 'object') {
      walk(child as Node, visit);
    }
  }
}
