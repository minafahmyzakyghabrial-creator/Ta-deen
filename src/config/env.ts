import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { ConfigError } from './errors';

/**
 * Loads `.env` exactly once.
 *
 * Decision: a single git-ignored `.env` with ENV-prefixed keys (UAT_INVESTOR_URL, ...)
 * instead of one file per environment. One file is easier to maintain locally, and the
 * same key names map 1:1 to CI secrets. Real process env vars always take precedence
 * (dotenv never overrides an existing variable), so CI does not need a file at all.
 */
let loaded = false;
export function loadDotEnv(): void {
  if (loaded) return;
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }
  loaded = true;
}

/** Returns a trimmed env var, or undefined when unset/empty. */
export function readVar(name: string): string | undefined {
  loadDotEnv();
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Reads several variables and fails with ONE clear message listing every missing name
 * (instead of failing one variable at a time).
 */
export function requireVars<K extends string>(names: Record<K, string>, context: string): Record<K, string> {
  const missing: string[] = [];
  const result = {} as Record<K, string>;
  for (const key of Object.keys(names) as K[]) {
    const value = readVar(names[key]);
    if (value === undefined) missing.push(names[key]);
    else result[key] = value;
  }
  if (missing.length) {
    throw new ConfigError(
      `Missing required variable(s) for ${context}:\n` +
        missing.map((m) => `   - ${m}`).join('\n') +
        `\n   Add them to your local .env file (see .env.example) or set them as CI secrets.` +
        `\n   Run "npm run env:check" to see the full configuration status.`,
    );
  }
  return result;
}

export function readBool(name: string, fallback: boolean): boolean {
  const v = readVar(name);
  if (v === undefined) return fallback;
  return ['true', '1', 'yes', 'y'].includes(v.toLowerCase());
}

export function readNumber(name: string, fallback: number): number {
  const v = readVar(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new ConfigError(`Variable ${name} must be a number, got "${v}".`);
  return n;
}
