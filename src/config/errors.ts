/**
 * Thrown when the framework is mis-configured (missing env var, unknown env, ...).
 * The message is written for a human: it says exactly what is missing and where to put it.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(`\n[Taadeen config] ${message}\n`);
    this.name = 'ConfigError';
  }
}
