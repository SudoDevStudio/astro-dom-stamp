import { resolveOptions } from '../src/core/options.js';
import type { EncodeSettings } from '../src/core/encode.js';

export function settingsFor(
  read: string[],
  skipFields: string[] = [],
  deepStamps = false,
): EncodeSettings {
  const resolved = resolveOptions({ read, skipFields, deepStamps });
  return {
    read: resolved.read,
    skipFields: resolved.skipFields,
    deepStamps: resolved.deepStamps,
  };
}

export const defaultSettings = settingsFor(['id', 'uid', 'sku']);
/** With `deepStamps`, so markers carry field paths rather than a counter. */
export const deepSettings = settingsFor(['id', 'uid', 'sku'], [], true);
