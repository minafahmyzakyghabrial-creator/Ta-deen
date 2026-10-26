import { ConfigError } from './errors';
import { readBool, readVar } from './env';

/**
 * Per-run options that change on every execution (not per environment).
 *
 *   REQUEST_NUMBER  -> the existing request a test operates on (e.g. 76092)
 *   ALLOW_SUBMIT    -> must be "true" for a test to press the final Submit button
 *
 * Example (PowerShell):
 *   $env:REQUEST_NUMBER="76092"; $env:ALLOW_SUBMIT="false"
 *   npx playwright test tests/exploration-license --project=chromium --headed
 */
export function getRequestNumber(fallback?: string): string {
  const value = readVar('REQUEST_NUMBER') ?? fallback?.trim();
  if (!value) {
    throw new ConfigError(
      'REQUEST_NUMBER is not set. Set it in the spec, or e.g. (PowerShell) $env:REQUEST_NUMBER="76092".',
    );
  }
  if (!/^\d+$/.test(value)) {
    throw new ConfigError(`REQUEST_NUMBER must contain digits only, got "${value}".`);
  }
  return value;
}

/** Whether to press the final Submit. The ALLOW_SUBMIT env var wins over the caller's default. */
export function isSubmitAllowed(fallback = false): boolean {
  return readBool('ALLOW_SUBMIT', fallback);
}
