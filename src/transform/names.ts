export const ENCODE_IMPORT = '__encode';
export const ENCODE_RESULT_IMPORT = '__encodeResult';

// Aliased on import so a project that already has an `__encode` in scope
// cannot collide with ours.
export const ENCODE_LOCAL = '$$adsEncode';
export const ENCODE_RESULT_LOCAL = '$$adsEncodeResult';

export const VIRTUAL_RUNTIME = 'virtual:astro-dom-stamp/runtime';

export const RUNTIME_IMPORT =
  `import { ${ENCODE_IMPORT} as ${ENCODE_LOCAL}, ` +
  `${ENCODE_RESULT_IMPORT} as ${ENCODE_RESULT_LOCAL} } from '${VIRTUAL_RUNTIME}';\n`;

/** Rule name used in the coverage report for a plain `.json()` call. */
export const JSON_RULE = '.json()';
