import MagicString from 'magic-string';
import { parseSync, visitorKeys } from 'oxc-parser';
import {
  ENCODE_LOCAL,
  ENCODE_RESULT_LOCAL,
  RUNTIME_IMPORT,
  VIRTUAL_RUNTIME,
} from './names.js';
import { mightMatch, type SourceMatcher } from './sources.js';

export { mightMatch } from './sources.js';

export interface RewriteOptions {
  /** Extra call expressions to treat as data sources, e.g. `client.query`. */
  sources?: SourceMatcher[];
}

/** Which rule matched, counted so a build can report coverage. */
export const JSON_RULE = '.json()';

export interface RewriteResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  wrapped: number;
  /** Rule name -> how many call sites it wrapped in this file. */
  matched: Record<string, number>;
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

export function rewrite(id: string, code: string, options: RewriteOptions = {}): RewriteResult | null {
  const sources = options.sources ?? [];
  if (!mightMatch(code, sources)) return null;
  if (code.includes(VIRTUAL_RUNTIME)) return null;

  const lang = langFor(id);
  if (lang === null) return null;

  const parsed = parseSync(id, code, { sourceType: 'module', lang, range: false });
  if (parsed.errors.length > 0) return null;

  const targets: Array<{ node: Node; wrapper: Wrapper; rule: string }> = [];
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
      targets.push({ node, wrapper: ENCODE_LOCAL, rule: JSON_RULE });
      return;
    }
    if (calleeName === null) return;
    for (const source of sources) {
      if (source.test(calleeName)) {
        targets.push({ node, wrapper: ENCODE_RESULT_LOCAL, rule: source.pattern });
        return;
      }
    }
  });

  const pending = targets.filter((target) => !alreadyWrapped.has(target.node));
  if (pending.length === 0) return null;

  const magic = new MagicString(code);
  const matched: Record<string, number> = {};
  for (const { node, wrapper, rule } of pending) {
    magic.appendLeft(node.start, `${wrapper}(`);
    magic.appendRight(node.end, ')');
    matched[rule] = (matched[rule] ?? 0) + 1;
  }
  magic.prepend(RUNTIME_IMPORT);

  return {
    code: magic.toString(),
    map: magic.generateMap({ source: id, includeContent: true, hires: true }),
    wrapped: pending.length,
    matched,
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

function dottedName(node: Node): string | null {
  if (node.type === 'Identifier') return node.name as string;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type !== 'MemberExpression' || node.computed === true) return null;
  const property = node.property as Node;
  if (property.type !== 'Identifier') return null;
  const object = dottedName(node.object as Node);
  return object === null ? null : `${object}.${property.name as string}`;
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
