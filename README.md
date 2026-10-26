# Taadeen Test Automation Framework

Playwright + TypeScript framework for the **Taadeen Mining Services Platform** (OutSystems Reactive).
It supports **multiple environments**, **multiple portals** and **multiple users/roles**, including
**cross-portal end-to-end tests** in which an Investor and an Employee are logged in at the same time in one test.

---

## 1. Quick start

**You need:** Node.js 20 or later. Java 8 or later is needed only for the Allure HTML report.

```bash
npm install
npx playwright install                 # downloads browsers (+ ffmpeg for videos)
cp .env.example .env                   # Windows: copy .env.example .env
# edit .env -> fill UAT_INVESTOR1_* and UAT_EMPLOYEE1_* credentials
npm run env:check                      # shows what is configured / missing (never prints secrets)
npm run test:uat                       # run everything against UAT
```

You can list the tests **without any credentials**:

```bash
npm run test:list
```

---

## 2. Commands

| Command | What it does |
|---|---|
| `npm run test:dev` / `test:sit` / `test:test` / `test:uat` | Run all tests against that environment |
| `npm run test:prod` | Run only `@prod-safe` tests. Also requires `ALLOW_PROD_RUN=true` |
| `npm run test:uat:smoke` | Run only `@smoke` tests on UAT (also `test:sit:smoke`, `test:dev:smoke`) |
| `npm run test:uat:e2e` | Run only `@e2e` tests on UAT |
| `npm run test:headed` | Run on UAT with a visible browser, 1 worker |
| `npm run test:debug` | Open the Playwright Inspector (step through a test) |
| `npm run test:ui` | Open Playwright UI mode |
| `npm run test:list` | List every test (no credentials needed) |
| `npm run env:check` | Show the configuration status of every environment |
| `npm run auth:clear` | Delete saved login sessions, so the next run logs in fresh |
| `npm run typecheck` | TypeScript compile check |
| `npm run report` | Open the Playwright HTML report |
| `npm run allure:serve` | Build and open the Allure report (needs Java) |

To pass extra Playwright arguments, add them after `--`:

```bash
npm run test:uat -- tests/auth                     # one folder
npm run test:uat -- -g "Investor User 1"           # by title
npm run test:uat -- --grep "@smoke|@auth"          # by tags
npm run test:uat -- --workers=4 --headed
```

**Tags in use:** `@smoke`, `@regression`, `@auth`, `@e2e`, `@cross-portal`, `@prod-safe`.

---

## 3. Folder structure

```
taadeen-automation/
├── playwright.config.ts        # runner config: env-aware timeouts, reporters, artifacts, PROD grep
├── .env.example                # template of every variable (copy to .env, which is git-ignored)
├── src/
│   ├── config/                 # ── single source of truth for configuration
│   │   ├── environments.ts     #    dev / sit / uat / prod settings (non-secret)
│   │   ├── portals.ts          #    investor / employee portals + their auth strategy
│   │   ├── users.ts            #    user registry (investor1, employee1, ...)
│   │   ├── env.ts              #    .env loading + validation with clear errors
│   │   └── safety.ts           #    production guards
│   ├── auth/                   # ── authentication & session isolation
│   │   ├── strategies/         #    one LoginStrategy per login mechanism
│   │   ├── SessionManager.ts   #    one BrowserContext per user, reuse + re-validation
│   │   └── AuthStateStore.ts   #    saved sessions in .auth/<env>/<user>.json
│   ├── fixtures/test.ts        # ── `test` with investor / employee / sessions fixtures
│   ├── pages/                  # ── Page Object Model
│   │   ├── BasePage.ts, LoginPage.ts
│   │   ├── investor/           #    InvestorLoginPage, InvestorHomePage, InvestorPortal
│   │   └── employee/           #    EmployeeLoginPage, EmployeeHomePage, EmployeePortal
│   ├── components/             # ── reusable OutSystems widgets (Dropdown, DataTable, FileUpload, FeedbackMessage)
│   ├── flows/                  # ── business workflows that span several pages/portals
│   ├── data/test-data.ts       # ── test data loader (common + per-environment JSON)
│   └── utils/                  # ── OutSystems server-call waits, unique data, logger
├── test-data/
│   ├── common/*.json           # data for every environment
│   └── <env>/*.json            # per-environment overrides (merged on top)
├── tests/
│   ├── smoke/                  # availability checks (no login)
│   ├── auth/                   # login tests per portal
│   └── e2e/                    # cross-portal workflows
└── scripts/                    # env:check, auth:clear
```

Generated folders (all git-ignored): `.auth/`, `test-results/`, `reports/`, `allure-results/`.

---

## 4. Configuration

### 4.1 Environments

The npm script sets `TEST_ENV` (`dev | sit | test | uat | prod`). The framework then reads only that environment's variables:

```
<ENV>_<PORTAL>_URL         e.g. UAT_INVESTOR_URL, UAT_EMPLOYEE_URL
<ENV>_<USER>_USERNAME      e.g. UAT_INVESTOR1_USERNAME
<ENV>_<USER>_PASSWORD      e.g. UAT_EMPLOYEE1_PASSWORD
```

- **Locally**, put these in `.env`. It is git-ignored.
- **In CI**, set the same names as secret pipeline variables. You don't need a file. Real environment variables always override `.env`.

**Validation is lazy and grouped.** A missing variable fails only the tests that need it, and the error lists every missing name at once:

```
[Taadeen config] Missing required variable(s) for user "investor1" in UAT:
   - UAT_INVESTOR1_USERNAME
   - UAT_INVESTOR1_PASSWORD
   Add them to your local .env file (see .env.example) or set them as CI secrets.
```

### 4.2 Portal URLs

You configure the **login URL** of each portal. The application root is derived from it automatically.
For example, `…/MiningPortal/Login` gives `…/MiningPortal/`.

| Env | Investor | Employee |
|---|---|---|
| UAT | `https://platform-uat.taadeen.dev/MiningPortal/Login` | `https://platform-uat.taadeen.dev/MiningPortal/Login_LDAP` |
| DEV / SIT / PROD | **TODO: provide** | **TODO: provide** |

### 4.3 Users

Initial users: **`investor1`** (Investor User 1) and **`employee1`** (Employee User 1).

---

## 5. How to extend (no restructuring needed)

**Add an environment (e.g. `preprod`):**

1. Add an entry to `src/config/environments.ts`.
2. Add `PREPROD_*` variables to `.env` / CI.
3. Add the script `"test:preprod": "cross-env TEST_ENV=preprod playwright test"`.

**Add a user (e.g. a second investor):**

1. Add one line to `src/config/users.ts`: `investor2: { portal: 'investor', role: 'investor', description: '…' }`.
2. Add `UAT_INVESTOR2_USERNAME` / `UAT_INVESTOR2_PASSWORD`.
3. Use it in a test:
   ```ts
   test('...', async ({ sessions }) => {
     const investor2 = new InvestorPortal((await sessions.as('investor2')).page);
   });
   ```

**Add a portal or role (e.g. `admin`):**

1. Add an entry to `src/config/portals.ts` with its `authStrategy`.
2. Add a login page object and register a strategy in `src/auth/strategies/index.ts`.
3. Add `<ENV>_ADMIN_URL`.
4. Optionally add an `admin` fixture in `src/fixtures/test.ts`.

**Change a login mechanism (e.g. the investor moves to SSO or Nafath):** write a new class that implements `LoginStrategy` and point the portal at it. Tests don't change.

**Add a business screen:** create `src/pages/<portal>/XxxPage.ts` extending `BasePage`, expose it as a getter on `InvestorPortal` or `EmployeePortal`, and orchestrate it from a flow in `src/flows/`.

---

## 6. Cross-portal testing and session isolation

On UAT both portals are **the same OutSystems application on the same domain**. Only the login screen differs.
If both users shared one browser context, the second login would overwrite the first one's session cookies,
and an "investor submits, employee approves" test would actually run as a single user.

`SessionManager` therefore gives **every user its own `BrowserContext`**, with its own cookies and storage:

```ts
test('investor submits → employee approves', async ({ investor, employee }) => {
  const requestId = await RequestFlow.submitApplication(investor, data);   // investor context
  await RequestFlow.openRequest(employee, requestId);                       // employee context
  await RequestFlow.decide(employee, requestId, 'approve');
  await investor.page.reload();                                             // back to investor, still logged in
});
```

`tests/e2e/cross-portal-session-isolation.spec.ts` shows this works. It logs in both users, checks that their contexts and session cookies differ, and switches back and forth between them.
`tests/e2e/cross-portal-request.template.spec.ts` is the target shape for business workflows. It is marked `fixme` until `RequestFlow` is implemented.

**Session reuse.** After a successful login, the session is saved to `.auth/<env>/<user>.json` along with the page the app landed on.
Later tests reuse it for `AUTH_SESSION_TTL_MINUTES` (default 30). Before each reuse, the framework reopens that landing page.
If the app redirects to a login screen, it logs in again automatically. Set `AUTH_SESSION_TTL_MINUTES=0` to always log in fresh.
The login tests in `tests/auth/` deliberately use `sessions.anonymous()`, so they always exercise the real login UI.

---

## 7. OutSystems-specific design

| Challenge | How the framework handles it |
|---|---|
| Dynamic IDs (`b3-b12-Input_X`) | IDs with a block prefix are never used. The login inputs use **un-prefixed widget IDs**, checked on UAT. **Ask developers to add `data-testid`** (Service Studio → widget → Attributes) to every element tests touch. |
| Client-side rendering (Reactive SPA) | Every page object waits for its own elements, using Playwright auto-waiting and web-first `expect`. There are no `waitForTimeout` sleeps. |
| AJAX / server actions | `utils/os-waits.ts` waits for the specific `/screenservices/<Module>/…/<Action>` POST, and `clickAndWaitForServer()` returns its JSON body. Use that body to read values like a Request ID instead of scraping the UI. |
| Dynamic dropdowns | `components/Dropdown.ts` waits for options to load. It supports native `<select>` and OutSystems UI searchable dropdowns. |
| Tables and pagination | `components/DataTable.ts` finds rows by text and searches across pages. The owning page object supplies the next-page button. |
| File uploads | `components/FileUpload.ts` uses `setInputFiles` on the (hidden) file input. |
| Toasts / feedback | `components/FeedbackMessage.ts` handles all toasts in one place. |
| Arabic / RTL | The browser locale is `ar-SA` and the time zone `Asia/Riyadh`. Locators don't depend on label text, so tests work in Arabic or English. |

---

## 8. Reporting and artifacts

- **List reporter** in the console.
- **Playwright HTML report:** `reports/html` (`npm run report`).
- **Allure:** results in `allure-results`, report in `reports/allure` (`npm run allure:serve`). Environment info is included.
- **JUnit XML:** `reports/junit/results.xml`, for Azure DevOps or Jenkins test tabs.
- **When a test fails:** a screenshot, a **trace** (`npx playwright show-trace <zip>`) and a video.
  For multi-user tests, **every user's** final screen and video are attached, labelled with the user (e.g. `employee1 — final screen`).

---

## 9. Production safety

PROD runs are protected by three independent guards:

1. When `TEST_ENV=prod`, only tests tagged **`@prod-safe`** run (set in `playwright.config.ts`).
2. Opening any session requires **`ALLOW_PROD_RUN=true`**.
3. Flows that create or modify data call `assertMutationsAllowed()`, which **throws in PROD**.

Currently only the read-only login-page availability checks are `@prod-safe`.

---

## 10. Verified vs still to be provided

**Verified on UAT (2026-10-19), without logging in:**

- Investor login (`/MiningPortal/Login`): `#Input_UsernameVal2`, `#Input_PasswordVal2`, `button[type=submit]`.
- Employee LDAP login (`/MiningPortal/Login_LDAP`): `#Input_UsernameVal`, `#Input_PasswordVal`, `button[type=submit]`.
- Default language is Arabic (`ar-SA`), with an English toggle.
- Server calls go to `/MiningPortal/screenservices/...`.
- The login page calls `ActionIs_Captcha`, which currently returns `Valid: false` on UAT.

**Still needed:**

- [ ] DEV / SIT / PROD portal URLs
- [ ] Credentials for `investor1` and `employee1` in each environment (in `.env` only)
- [ ] A unique landmark on the investor and employee **post-login pages**, to strengthen `expectLoaded()` in `InvestorHomePage` / `EmployeeHomePage`
- [x] Confirmation of the **error toast** markup. Verified on TEST: `.feedback-message-error`, text in `.feedback-message-text`
- [ ] Whether **captcha or OTP** is enabled in any environment. If so, ask for a test bypass in non-prod
- [ ] Application screens for the first workflow, so `src/flows/request.flow.ts` can be implemented
- [ ] Agreement with developers on adding `data-testid` attributes

---

## 11. Conventions

- Import `test` / `expect` from `@fixtures/test`, never from `@playwright/test`, in specs.
- Specs contain business steps (`test.step`) and assertions only. Selectors live in page objects or components.
- Never hard-code URLs, credentials or environment names in tests.
- Use `uniqueName()` / `uniqueSuffix()` for data that must be unique per run. Parallel workers share environments.
- Never use `page.waitForTimeout()`. Wait for an element, a URL or a server call instead.

---

## 12. Exploration License (ESNAD / Ta'adeen): complete an existing draft

`tests/exploration-license/exploration-license.spec.ts` opens an **existing** Exploration License request, given at run time. It passes wizard steps 1–2 without changes, fills steps 3–8 with valid data, and stops before the final **إرسال** (Submit).

### Run it

```powershell
# one-time: TEST_INVESTOR1_USERNAME / TEST_INVESTOR1_PASSWORD in your local .env (git-ignored)
$env:TEST_ENV="test"            # or set TEST_ENV=test in .env
$env:REQUEST_NUMBER="76092"     # any Exploration License draft of the test investor
$env:ALLOW_SUBMIT="false"       # "true" = also press إرسال (Submit)
npx playwright test tests/exploration-license --project=chromium --headed
# or: npm run test:exploration
```

- `REQUEST_NUMBER` is required and must be digits only. If the search doesn't return that request, the test fails with `RequestNotFoundError`.
- The request must offer the **تعديل** (edit) row action, which drafts do. Otherwise the error lists the actions that are available.
- Re-runs are safe. Every field, table, multi-select and attachment is filled only when it is empty, and existing values are kept. The `step-report.json` attachment lists what was filled and what was kept, per step.

### Flow and code map

| Part | Code |
|---|---|
| Requests list → search → row action "تعديل" | `src/pages/investor/RequestsPage.ts` |
| Wizard (steps, Next, Submit, validation detection) | `src/components/Wizard.ts` |
| Steps 3–8 | `src/pages/investor/exploration-license/*Step.ts`, `FinalSteps.ts` |
| Add-row popups, Virtual-Select multi-selects | `src/components/AddRowDialog.ts`, `MultiSelect.ts` |
| Fill-if-empty, radio-by-label, uploads | `src/utils/field-helper.ts` |
| Validation messages → `WizardValidationError` | `src/utils/validation.ts` |
| Saudi ID / mobile / e-mail generators | `src/utils/data-generator.ts` |
| Test data (defaults + JSON overrides) | `src/data/exploration-license.data.ts` |
| Orchestration | `src/flows/exploration-license.flow.ts` |

Steps are dispatched by **name**. If a step appears that wasn't explored, the test fails with "not automated"; it never fills a step with guessed data. Sections are located by OutSystems `data-block` names, for example `StepThree_WorkPlan_UIFlow.StudyPlan`. These are stable and don't depend on the UI language.

To override test data, add `test-data/common/exploration-license.json` (all environments) or `test-data/<env>/exploration-license.json`, containing only the keys you want to change:

```json
{ "financial": { "availableBalance": "250000" }, "workPlan": { "deskStudy": { "العدد": "2" } } }
```

### Wizard steps and the rules found on TEST (2026-10-26, request 76092: 1-year licence, category أ)

| # | Step | Required, as reported by the app | Values used |
|---|---|---|---|
| 1 | معلومات الطلب | — (passed unchanged) | — |
| 2 | موقع الطلب | — (passed unchanged; GIS map) | — |
| 3 | خطة العمل و الانفاق | Work-plan description (exploration nature, survey result, field-report attachment) · desk studies · technical studies · geochemical survey · geophysical survey · physical lab analysis · rehabilitation cost for **every** year · other expenses · land ownership · declarations · **at least one of reverse-circulation or diamond drilling** · timeline (year, month, duration) for every planned activity | Diamond drilling: **minimum 4 holes**, cost per metre 300–700, depth 20–1000 (reverse circulation: 120–350 and 12–300) · quantity max 7 digits · timeline duration max 3 digits, enabled only after year and month are chosen · public land ownership (full or partial ownership adds owners and deeds) |
| 4 | إثبات القدرة المالية | At least one proof checkbox · total **≥ minimum annual exploration spend** (tooltip) | Bank statement, balance 150,000 + PDF |
| 5 | خطة الأثر الاجتماعي | Employee: name, **ID 10 digits starting 1/2**, position, **mobile 9 digits starting 5**, valid email · ≥ 1 grievance mechanism, stakeholder, engagement plan, social impact, local programme, local community, employment plan, purchase plan | Luhn-valid generated ID · local jobs ≤ total jobs · "بالتساوي" (equal) yearly split = 100% |
| 6 | خطة الأثر البيئي | All applicant obligations (the impacts table isn't required) | One "الهواء" (air) impact row, monitored yearly |
| 7 | المرفقات | — (optional) | none |
| 8 | الشروط والأحكام | Both terms checkboxes | Submit is always enabled: "ready" means all Next clicks were accepted and both terms are ticked |

Attachments accept `.jpg .jpeg .png .pdf .xlsx .xls`. The fixture is `test-data/attachments/sample.pdf`.

### Behaviour to be aware of

- **Every Next saves the step on the server.** Steps 1–2 are re-saved unchanged.
- Declarations, obligations and terms are legal attestations. Ticking them is authorized **for the TEST environment only**.
- A cold load of the `Licenses_Explorations` module takes about 13 s, so the first render gets a 60 s budget.
- Opening `/MiningPortal/Requests` directly shows 0 results, so the list is opened from the side menu.

### Limitations / still to verify

- [x] **Starting from an empty draft**: verified 2026-10-26 on request 76096. Every field was filled, every step was accepted, and the run stopped before Submit (1.8 min).
- [x] **Submit (`ALLOW_SUBMIT=true`)**: executed on request 76096 (2026-10-26). There is no toast. The status changed from "مسودة" (draft) to "الموقع قيد المراجعة" (location under review), with a submission time of 13:37:00. The spec now checks this in the Requests list after Submit. That check step is new and has not yet run in a full submit run, because it needs another fresh draft.
- [ ] **Licences longer than 1 year**: the per-year popups, rehabilitation inputs and timeline years were only seen for 1 year.
- [ ] **Not automated:** financial proof "القوائم المالية" (financial statements); full/partial land ownership; technical justifications (optional); additional attachments (step 7).
- [ ] **Possible app defect:** after saving step 6 and reloading, the impact row shows only the monitoring frequency. The impacts, activities and mitigation columns are empty, though they were selected in the popup. Verify manually.
