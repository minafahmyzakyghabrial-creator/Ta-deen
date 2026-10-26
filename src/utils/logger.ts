/* Minimal structured logger. Swap for pino/winston later without touching callers. */
type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? order.info;

function log(level: Level, scope: string, message: string): void {
  if (order[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${message}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export function createLogger(scope: string) {
  return {
    debug: (m: string) => log('debug', scope, m),
    info: (m: string) => log('info', scope, m),
    warn: (m: string) => log('warn', scope, m),
    error: (m: string) => log('error', scope, m),
  };
}
