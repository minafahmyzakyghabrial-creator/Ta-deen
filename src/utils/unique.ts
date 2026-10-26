/**
 * Unique values for test data, so parallel workers and repeated runs never collide.
 * Format keeps a sortable timestamp + worker index + random suffix.
 */
export function uniqueSuffix(): string {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const worker = process.env.TEST_WORKER_INDEX ?? '0';
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}${worker}${rand}`;
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}`;
}
