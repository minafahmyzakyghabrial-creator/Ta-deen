import { defineConfig, devices } from '@playwright/test';
import { getEnvironment, getEnvName, PROD_SAFE_TAG, readBool, readVar } from './src/config';

/**
 * Central Playwright configuration.
 *
 * The active environment comes from TEST_ENV (set by the npm scripts: test:dev, test:sit,
 * test:uat, test:prod). Nothing here needs URLs or credentials, so `playwright test --list`
 * works on a fresh clone with no .env file.
 */
const envName = getEnvName();
const env = getEnvironment(envName);
const isCI = !!process.env.CI;
const recordArtifacts = readVar('RECORD') !== 'off';

const workersVar = readVar('WORKERS');
const workers = workersVar ? (workersVar.endsWith('%') ? workersVar : Number(workersVar)) : isCI ? 2 : undefined;

export default defineConfig({
  testDir: './tests',
  /** Cross-portal flows involve two logins and several server round-trips. */
  timeout: 120_000,
  expect: { timeout: env.expectTimeout },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? env.retries : 0,
  workers,

  /** PROD guard #1: only tests explicitly tagged @prod-safe may run in production. */
  grep: env.isProduction ? new RegExp(PROD_SAFE_TAG) : undefined,

  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        detail: true,
        suiteTitle: true,
        environmentInfo: {
          Environment: env.displayName,
          TEST_ENV: envName,
          Node: process.version,
          OS: process.platform,
        },
      },
    ],
  ],

  use: {
    headless: readBool('HEADLESS', true),
    /** Taadeen defaults to Arabic (ar-SA). Locators are language-independent, but keep the real locale. */
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    viewport: { width: 1440, height: 900 },
    actionTimeout: env.actionTimeout,
    navigationTimeout: env.navigationTimeout,
    ignoreHTTPSErrors: !env.isProduction,
    /** RECORD=off skips trace + video recording (faster runs; failures keep only a screenshot). */
    trace: recordArtifacts ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    video: recordArtifacts ? 'retain-on-failure' : 'off',
    /** NOTE: no baseURL — there are several portals; page objects use URLs from src/config/portals.ts. */
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // Enable when needed (many government users run Edge):
    // { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1440, height: 900 } } },
  ],
});
