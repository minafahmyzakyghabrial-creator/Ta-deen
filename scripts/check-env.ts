/**
 * npm run env:check            -> status of every environment
 * TEST_ENV=uat npm run env:check  (or: npx cross-env TEST_ENV=uat npm run env:check) -> highlights one env
 *
 * Prints which variables are set / missing. NEVER prints usernames or passwords.
 */
import {
  credentialVarNames,
  ENV_NAMES,
  getEnvironment,
  getEnvName,
  PORTAL_KEYS,
  portalUrlVar,
  readVar,
  USER_KEYS,
  getUser,
} from '../src/config';

const active = getEnvName();
const ok = (b: boolean) => (b ? 'OK     ' : 'MISSING');
let activeMissing = 0;

for (const env of ENV_NAMES) {
  const settings = getEnvironment(env);
  const marker = env === active ? '  <== active (TEST_ENV)' : '';
  console.log(`\n=== ${env.toUpperCase()} — ${settings.displayName}${settings.isProduction ? ' [PRODUCTION]' : ''}${marker}`);

  for (const portal of PORTAL_KEYS) {
    const name = portalUrlVar(portal, env);
    const value = readVar(name);
    if (!value && env === active) activeMissing++;
    console.log(`  [${ok(!!value)}] ${name}${value ? `  ${value}` : ''}`);
  }
  for (const user of USER_KEYS) {
    const vars = credentialVarNames(user, env);
    for (const v of Object.values(vars)) {
      const set = !!readVar(v);
      if (!set && env === active) activeMissing++;
      console.log(`  [${ok(set)}] ${v}   (${getUser(user).description})`);
    }
  }
}

console.log(
  activeMissing
    ? `\n${activeMissing} variable(s) missing for the active environment "${active}". Tests needing them will fail with a clear message; others still run.\n`
    : `\nActive environment "${active}" is fully configured.\n`,
);
