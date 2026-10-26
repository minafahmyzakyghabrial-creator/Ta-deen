import fs from 'fs';
import path from 'path';
import { ConfigError, getEnvName } from '@config/index';

/**
 * Test data management.
 *
 *   test-data/common/<name>.json   -> data valid in every environment
 *   test-data/<env>/<name>.json    -> environment-specific overrides (merged on top)
 *
 * Example: loadTestData<LicenseData>('license')  in UAT merges
 *          test-data/common/license.json + test-data/uat/license.json
 *
 * Keep secrets OUT of these files (they are committed). Use .env for anything sensitive.
 * For data that must be unique per run, combine with src/utils/unique.ts.
 */
const ROOT = path.resolve(__dirname, '../../test-data');

function readJson(file: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ConfigError(`Invalid JSON in ${path.relative(process.cwd(), file)}: ${(e as Error).message}`);
  }
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base) || typeof override !== 'object') {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function loadTestData<T = Record<string, unknown>>(name: string): T {
  const common = readJson(path.join(ROOT, 'common', `${name}.json`));
  const specific = readJson(path.join(ROOT, getEnvName(), `${name}.json`));
  if (!common && !specific) {
    throw new ConfigError(`No test data "${name}" found in test-data/common or test-data/${getEnvName()}.`);
  }
  return deepMerge((common ?? {}) as T, specific);
}

/** Like loadTestData, but returns undefined instead of failing when no file exists. */
export function loadOptionalTestData<T = Record<string, unknown>>(name: string): Partial<T> | undefined {
  const common = readJson(path.join(ROOT, 'common', `${name}.json`));
  const specific = readJson(path.join(ROOT, getEnvName(), `${name}.json`));
  if (!common && !specific) return undefined;
  return deepMerge((common ?? {}) as Partial<T>, specific);
}
