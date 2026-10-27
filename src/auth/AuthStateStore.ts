import fs from 'fs';
import path from 'path';
import { getEnvName, readNumber, UserKey } from '@config/index';

/**
 * Persists a logged-in browser session (cookies + localStorage) per environment and user:
 *     .auth/<env>/<userKey>.json        Playwright storageState
 *     .auth/<env>/<userKey>.meta.json   { savedAt, landingUrl }
 *
 * Decision: logging in through the UI for every test is slow and stresses LDAP/IdP.
 * Sessions are reused for AUTH_SESSION_TTL_MINUTES (default 30) and always re-validated
 * before use; anything invalid falls back to a fresh login automatically.
 * Folder is git-ignored because it contains live session cookies.
 */
export interface AuthMeta {
  savedAt: string;
  /** Page the app opened right after login — known to require authentication. */
  landingUrl: string;
}

const ROOT = path.resolve(__dirname, '../../.auth');

export class AuthStateStore {
  private readonly dir: string;

  constructor(private readonly env = getEnvName()) {
    this.dir = path.join(ROOT, this.env);
  }

  statePath(user: UserKey): string {
    return path.join(this.dir, `${user}.json`);
  }

  private metaPath(user: UserKey): string {
    return path.join(this.dir, `${user}.meta.json`);
  }

  ttlMs(): number {
    return readNumber('AUTH_SESSION_TTL_MINUTES', 30) * 60_000;
  }

  /** Returns metadata if a non-expired saved session exists, otherwise undefined. */
  getFresh(user: UserKey): AuthMeta | undefined {
    const ttl = this.ttlMs();
    if (ttl <= 0) return undefined;
    try {
      const meta = JSON.parse(fs.readFileSync(this.metaPath(user), 'utf8')) as AuthMeta;
      if (!fs.existsSync(this.statePath(user))) return undefined;
      if (Date.now() - new Date(meta.savedAt).getTime() > ttl) return undefined;
      return meta;
    } catch {
      return undefined;
    }
  }

  /** Atomic write (tmp + rename) so parallel workers never read a half-written file. */
  save(user: UserKey, state: unknown, meta: Omit<AuthMeta, 'savedAt'>): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const write = (file: string, data: unknown) => {
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, file);
    };
    write(this.statePath(user), state);
    write(this.metaPath(user), { ...meta, savedAt: new Date().toISOString() });
  }

  /**
   * Runs `fn` while holding a cross-process lock for this user, so parallel workers never log the same
   * user in at the same time. VERIFIED on TEST (2026-10-27): two simultaneous logins of investor1 left the
   * first worker on an empty, logged-out page. A lock older than LOCK_STALE_MS is treated as abandoned.
   */
  async withLoginLock<T>(user: UserKey, fn: () => Promise<T>): Promise<T> {
    fs.mkdirSync(this.dir, { recursive: true });
    const lock = path.join(this.dir, `${user}.lock`);
    for (;;) {
      try {
        fs.closeSync(fs.openSync(lock, 'wx'));
        break;
      } catch {
        const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
        if (age > AuthStateStore.LOCK_STALE_MS) fs.rmSync(lock, { force: true });
        else await new Promise((r) => setTimeout(r, 500));
      }
    }
    try {
      return await fn();
    } finally {
      fs.rmSync(lock, { force: true });
    }
  }

  private static readonly LOCK_STALE_MS = 3 * 60_000;

  invalidate(user: UserKey): void {
    for (const f of [this.statePath(user), this.metaPath(user)]) fs.rmSync(f, { force: true });
  }
}
