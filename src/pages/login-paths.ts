import { getPortalUrls, PORTAL_KEYS, readVar, portalUrlVar } from '@config/index';

/**
 * Login screens of every portal configured for the current environment.
 *
 * Why "any portal": both Taadeen portals live in the same OutSystems app, so an expired
 * employee session might be redirected to the investor /Login screen (or vice versa).
 * Treating every known login path as "not authenticated" makes session checks robust.
 */
export function configuredLoginPaths(): string[] {
  return PORTAL_KEYS.filter((p) => readVar(portalUrlVar(p)) !== undefined).map((p) =>
    getPortalUrls(p).loginPath.toLowerCase(),
  );
}

export function isAnyLoginPage(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  return configuredLoginPaths().includes(pathname);
}
