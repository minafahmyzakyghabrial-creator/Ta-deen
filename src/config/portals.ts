import { ConfigError } from './errors';
import { requireVars } from './env';
import { EnvName, envPrefix, getEnvName } from './environments';

/**
 * Portal registry.
 *
 * A portal = an entry point with its own login mechanism. In Taadeen UAT both portals
 * are the same OutSystems module (MiningPortal) on the same domain, with different
 * login screens (/Login for investors, /Login_LDAP for employees). We still model them
 * independently, because other environments (or the future) may host them separately
 * or switch one of them to SSO — the rest of the framework must not care.
 *
 * To add a portal (e.g. "admin"):
 *   1. add an entry below with its auth strategy,
 *   2. add <ENV>_ADMIN_URL to .env,
 *   3. implement/choose a LoginStrategy in src/auth/strategies.
 */
export interface PortalDefinition {
  readonly key: string;
  readonly displayName: string;
  /** Name of the login strategy (see src/auth/strategies/index.ts). */
  readonly authStrategy: AuthStrategyName;
}

export type AuthStrategyName = 'investor-form' | 'employee-ldap-form';

const PORTALS = {
  investor: {
    key: 'investor',
    displayName: 'Investor Portal',
    authStrategy: 'investor-form',
  },
  employee: {
    key: 'employee',
    displayName: 'Employee Portal',
    authStrategy: 'employee-ldap-form',
  },
} as const satisfies Record<string, PortalDefinition>;

export type PortalKey = keyof typeof PORTALS;
export const PORTAL_KEYS = Object.keys(PORTALS) as PortalKey[];

export function getPortal(key: PortalKey): PortalDefinition {
  const p = PORTALS[key];
  if (!p) throw new ConfigError(`Unknown portal "${key}". Valid portals: ${PORTAL_KEYS.join(', ')}.`);
  return p;
}

export interface PortalUrls {
  /** Full login page URL, as configured (e.g. https://host/MiningPortal/Login). */
  readonly loginUrl: string;
  /** Application root derived from the login URL (e.g. https://host/MiningPortal/). */
  readonly appBaseUrl: string;
  /** Path of the login screen, used to detect "still on / redirected to login". */
  readonly loginPath: string;
}

export function portalUrlVar(portal: PortalKey, env: EnvName = getEnvName()): string {
  return `${envPrefix(env)}_${portal.toUpperCase()}_URL`;
}

/** Resolves the URLs of a portal for the active environment. Validated lazily (on first use). */
export function getPortalUrls(portal: PortalKey, env: EnvName = getEnvName()): PortalUrls {
  const varName = portalUrlVar(portal, env);
  const { url } = requireVars({ url: varName }, `${getPortal(portal).displayName} in ${env.toUpperCase()}`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigError(`${varName} is not a valid URL: "${url}".`);
  }
  return {
    loginUrl: parsed.toString(),
    appBaseUrl: new URL('.', parsed).toString(),
    loginPath: parsed.pathname,
  };
}
