import { ConfigError } from './errors';
import { requireVars } from './env';
import { EnvName, envPrefix, getEnvName } from './environments';
import { PortalKey } from './portals';

/**
 * User registry.
 *
 * Users are identified by a stable KEY (investor1, employee1, ...). Tests refer to the
 * key, never to a username. Credentials are resolved per environment from:
 *     <ENV>_<KEY>_USERNAME / <ENV>_<KEY>_PASSWORD
 *
 * To add a user (e.g. a second investor):
 *   1. add `investor2: { portal: 'investor', role: 'investor', description: '...' }` below,
 *   2. add UAT_INVESTOR2_USERNAME / UAT_INVESTOR2_PASSWORD to .env,
 *   3. use it in a test:  const { page } = await sessions.as('investor2');
 * Nothing else changes.
 */
export type Role = 'investor' | 'employee' | 'admin';

export interface UserDefinition {
  /** Portal this user logs in through (decides URL + login mechanism). */
  readonly portal: PortalKey;
  /** Business role — useful for tagging, filtering, and role-specific assertions. */
  readonly role: Role;
  readonly description: string;
}

const USERS = {
  investor1: { portal: 'investor', role: 'investor', description: 'Investor User 1 — default investor' },
  employee1: { portal: 'employee', role: 'employee', description: 'Employee User 1 — default employee/reviewer' },
} as const satisfies Record<string, UserDefinition>;

export type UserKey = keyof typeof USERS;
export const USER_KEYS = Object.keys(USERS) as UserKey[];

/** Default user per portal — used by the `investorPage` / `employeePage` fixtures. */
export const DEFAULT_USERS: Record<PortalKey, UserKey> = {
  investor: 'investor1',
  employee: 'employee1',
};

export function getUser(key: UserKey): UserDefinition & { key: UserKey } {
  const u = USERS[key];
  if (!u) throw new ConfigError(`Unknown user "${key}". Registered users: ${USER_KEYS.join(', ')}.`);
  return { key, ...u };
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export function credentialVarNames(key: UserKey, env: EnvName = getEnvName()) {
  const base = `${envPrefix(env)}_${key.toUpperCase()}`;
  return { username: `${base}_USERNAME`, password: `${base}_PASSWORD` };
}

/** Resolves credentials lazily — only tests that actually log in need them. */
export function getCredentials(key: UserKey, env: EnvName = getEnvName()): Credentials {
  return requireVars(credentialVarNames(key, env), `user "${key}" in ${env.toUpperCase()}`);
}
