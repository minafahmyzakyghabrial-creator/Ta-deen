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
 * Keys are `investor<N>` or `employee<N>`; the prefix decides the portal and role. To add a user
 * (e.g. a second investor):
 *   1. add UAT_INVESTOR2_USERNAME / UAT_INVESTOR2_PASSWORD to .env,
 *   2. use it in a spec:  test.use({ investorUser: 'investor2' })
 *      or for a second session:  const { page } = await sessions.as('investor2');
 * Optionally list it in USERS below to give it a description and include it in `npm run env:check`.
 */
export type Role = 'investor' | 'employee' | 'admin';

export interface UserDefinition {
  /** Portal this user logs in through (decides URL + login mechanism). */
  readonly portal: PortalKey;
  /** Business role — useful for tagging, filtering, and role-specific assertions. */
  readonly role: Role;
  readonly description: string;
}

export type UserKey = `investor${number}` | `employee${number}`;

/** Registered users: descriptions, and the users `npm run env:check` reports on. */
const USERS: Partial<Record<UserKey, UserDefinition>> = {
  investor1: { portal: 'investor', role: 'investor', description: 'Investor User 1 — default investor' },
  employee1: { portal: 'employee', role: 'employee', description: 'Employee User 1 — default employee/reviewer' },
};

export const USER_KEYS = Object.keys(USERS) as UserKey[];

/** Default user per portal — used by the `investorPage` / `employeePage` fixtures. */
export const DEFAULT_USERS: Record<PortalKey, UserKey> = {
  investor: 'investor1',
  employee: 'employee1',
};

export function getUser(key: UserKey): UserDefinition & { key: UserKey } {
  const registered = USERS[key];
  if (registered) return { key, ...registered };
  const match = /^(investor|employee)(\d+)$/.exec(key);
  if (!match) {
    throw new ConfigError(`Invalid user "${key}". Use investor<N> or employee<N> (registered: ${USER_KEYS.join(', ')}).`);
  }
  const portal = match[1] as 'investor' | 'employee';
  return { key, portal, role: portal, description: `${portal === 'investor' ? 'Investor' : 'Employee'} User ${match[2]}` };
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
