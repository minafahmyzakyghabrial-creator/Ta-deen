import { ConfigError } from './errors';
import { readVar } from './env';

/**
 * Environment registry.
 *
 * Non-secret, per-environment behaviour lives here (committed to Git).
 * URLs and credentials live in .env / CI secrets (see portals.ts and users.ts).
 *
 * To add an environment (e.g. "preprod"):
 *   1. add an entry below,
 *   2. add PREPROD_* variables to .env,
 *   3. add an npm script: "test:preprod": "cross-env TEST_ENV=preprod playwright test".
 */
export interface EnvironmentSettings {
  /** Key used in TEST_ENV and as the prefix of env vars (uppercased). */
  readonly name: string;
  readonly displayName: string;
  /** Production-like environment: read-only safety rules apply. */
  readonly isProduction: boolean;
  /** Retries in CI for this environment (shared envs are often slower / flakier). */
  readonly retries: number;
  /** Default timeout for a single expect() assertion, ms. */
  readonly expectTimeout: number;
  /** Default timeout for page actions (click, fill), ms. */
  readonly actionTimeout: number;
  /** Default timeout for page navigations, ms. */
  readonly navigationTimeout: number;
}

const ENVIRONMENTS = {
  dev: {
    name: 'dev',
    displayName: 'Development',
    isProduction: false,
    retries: 1,
    expectTimeout: 15_000,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  sit: {
    name: 'sit',
    displayName: 'System Integration Testing',
    isProduction: false,
    retries: 1,
    expectTimeout: 15_000,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  test: {
    name: 'test',
    displayName: 'Testing',
    isProduction: false,
    retries: 1,
    expectTimeout: 15_000,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  uat: {
    name: 'uat',
    displayName: 'User Acceptance Testing',
    isProduction: false,
    retries: 1,
    expectTimeout: 15_000,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  prod: {
    name: 'prod',
    displayName: 'Production',
    isProduction: true,
    retries: 0,
    expectTimeout: 15_000,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
} as const satisfies Record<string, EnvironmentSettings>;

export type EnvName = keyof typeof ENVIRONMENTS;
export const ENV_NAMES = Object.keys(ENVIRONMENTS) as EnvName[];

/** Resolves the active environment from TEST_ENV (default: uat). */
export function getEnvName(): EnvName {
  const raw = (readVar('TEST_ENV') ?? 'uat').toLowerCase();
  if (!(raw in ENVIRONMENTS)) {
    throw new ConfigError(`Unknown TEST_ENV "${raw}". Valid values: ${ENV_NAMES.join(', ')}.`);
  }
  return raw as EnvName;
}

export function getEnvironment(name: EnvName = getEnvName()): EnvironmentSettings {
  return ENVIRONMENTS[name];
}

/**
 * A comma-separated list of environments from a variable, e.g. PAYMENT_UTILITY_ENVS=test,uat.
 * Unknown names fail clearly. Production is never accepted: these lists gate test-only utilities.
 */
export function readEnvList(name: string, fallback: readonly EnvName[]): EnvName[] {
  const raw = readVar(name);
  if (raw === undefined) return [...fallback];
  const list = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const unknown = list.filter((e) => !(e in ENVIRONMENTS));
  if (unknown.length) {
    throw new ConfigError(`${name}: unknown environment(s) "${unknown.join(', ')}". Valid values: ${ENV_NAMES.join(', ')}.`);
  }
  const envs = list as EnvName[];
  if (envs.some((e) => ENVIRONMENTS[e].isProduction)) throw new ConfigError(`${name} must not include a production environment.`);
  return envs;
}

/** Prefix used for every env var of an environment, e.g. "UAT". */
export function envPrefix(name: EnvName = getEnvName()): string {
  return name.toUpperCase();
}
