import { resolveOptions } from '../src/core/options.js';
import type { EncodeSettings } from '../src/core/encode.js';

export function settingsFor(read: string[], skipFields: string[] = []): EncodeSettings {
  const resolved = resolveOptions({ read, skipFields });
  return { read: resolved.read, skipFields: resolved.skipFields };
}

export const defaultSettings = settingsFor(['id', 'uid', 'sku']);
