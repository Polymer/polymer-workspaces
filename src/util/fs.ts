import * as fs from 'fs';

/**
 * Synchronously determines whether the given file exists.
 */
export function existsSync(fn: string): boolean {
  return safeStatSync(fn) !== undefined;
}

/**
 * Synchronously determines whether the given file exists.
 */
export function isDirSync(fn: string): boolean {
  const stats = safeStatSync(fn);
  if (stats === undefined) {
    return false;
  }
  return stats.isDirectory();
}

/**
 * Synchronously determines whether the given file exists.
 */
export function safeStatSync(fn: string): fs.Stats|undefined {
  try {
    return fs.statSync(fn);
  } catch (_) {
    return undefined;
  }
}
