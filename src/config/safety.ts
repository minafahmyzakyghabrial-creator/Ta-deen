import { ConfigError } from './errors';
import { readBool } from './env';
import { getEnvironment } from './environments';

/**
 * Production safety.
 *
 * Three independent guards, so one mistake is never enough to touch PROD:
 *   1. playwright.config.ts only runs tests tagged @prod-safe when TEST_ENV=prod;
 *   2. the session fixture refuses to start unless ALLOW_PROD_RUN=true;
 *   3. flows that create/modify data call assertMutationsAllowed() first.
 */
export const PROD_SAFE_TAG = '@prod-safe';

export function assertProdRunAllowed(): void {
  const env = getEnvironment();
  if (env.isProduction && !readBool('ALLOW_PROD_RUN', false)) {
    throw new ConfigError(
      `Refusing to run against ${env.displayName}. Set ALLOW_PROD_RUN=true explicitly if this is intended.`,
    );
  }
}

/** Call at the start of any flow that creates, submits, approves or modifies data. */
export function assertMutationsAllowed(action: string): void {
  const env = getEnvironment();
  if (env.isProduction) {
    throw new ConfigError(`"${action}" modifies data and is blocked in ${env.displayName}.`);
  }
}
