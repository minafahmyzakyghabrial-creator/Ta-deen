import { ConfigError, getEnvName, readVar, UserKey } from '@config/index';
import { saudiMobile, saudiNationalId, testEmail } from '@utils/data-generator';
import { explorationLicenseData } from './exploration-license.data';
import { deepMerge, loadOptionalTestData } from './test-data';

/**
 * Test data for the Exploration License TRANSFER service (تحويل رخصة الكشف).
 *
 * The two business keys — the licence to transfer and the transferee's CR — are NEVER defaulted in code.
 * They come, per scenario, from
 *   test-data/common/exploration-transfer.json   (all environments)
 *   test-data/<env>/exploration-transfer.json    (one environment, merged on top)
 * and can be overridden per run with environment variables (highest priority):
 *   TRANSFER_<SCENARIO>_LICENSE_NUMBER / TRANSFER_<SCENARIO>_TRANSFEREE_CR
 *   e.g. TRANSFER_AVAILABLE_LAND_LICENSE_NUMBER=20260311313, TRANSFER_REWORK_TRANSFEREE_CR=1010798976
 * A missing or malformed value fails with ConfigError; nothing is ever substituted.
 */
export const TRANSFER_SCENARIOS = ['availableLand', 'conditionedLand', 'rework', 'returnChain'] as const;
export type TransferScenarioKey = (typeof TRANSFER_SCENARIOS)[number];

/** GIS decisions as labelled on the GIS task (VERIFIED on TEST, request 76352). */
export type GisRecommendation = 'أرض متاحة' | 'أرض مشروطة';

export interface TransferScenario {
  /** Exact licence number the transferor selects in "رخص الكشف السارية". */
  readonly licenseNumber: string;
  /** Exact 10-digit CR of the transferee company ("رقم السجل التجاري للشركة المحال لها الرخصة"). */
  readonly transfereeCR: string;
  /** Investor who owns the licence (credentials <ENV>_<USER>_USERNAME / _PASSWORD). */
  readonly transferor: UserKey;
  /** Investor who owns transfereeCR. */
  readonly transferee: UserKey;
  /** Employee who completes every Task Management task. */
  readonly employee: UserKey;
  /** "يوجد معدات/آلات بالموقع" — when true the machinery sales agreement is uploaded too. */
  readonly equipmentOnSite: boolean;
  /** "الشركة المحال لها الرخصة تابعة للشركة مالكة الرخصة". */
  readonly subsidiary: boolean;
  /** Decision on the GIS task and on "Inspection & GIS Evaluation". */
  readonly gisRecommendation: GisRecommendation;
  /** Condition clauses added on the conditioned-land path (at least one). */
  readonly gisClauses: string[];
  /** Rework scenario only: what the technical assessment returns and how the transferee corrects it. */
  readonly rework?: {
    /** Technical-assessment section marked "لم تتحقق المتطلبات" (e.g. "الأثر الاجتماعي"). */
    readonly section: string;
    /** Mandatory description for the Not-Met rating and for "Return to Transferee". */
    readonly description: string;
    /**
     * One entry per return to the transferee — the request goes back to the investor `returns.length` times
     * (default 2). Each entry holds the values the transferee submits when correcting the returned section;
     * the test asserts the change was saved and is what the employee reassesses.
     */
    readonly returns: Record<string, string>[];
    /**
     * Optional second rework round, after the `returns` above: Consolidated Feedback "إعادة للموظف السابق" sends
     * `branches` back to their employees; the Financial Assessment is rated "لم تتحقق المتطلبات"; Consolidated
     * Feedback returns the request to the transferee, who corrects the financial data with `corrections`.
     */
    readonly employeeReturn?: {
      /** Branches returned to their employees (labels of the "أختر" list on "المراجعة العامة"). */
      readonly branches: string[];
      readonly description: string;
      /** Transferee correction of the returned financial section (label → new value). */
      readonly corrections: Record<string, string>;
    };
  };
  /**
   * Return-chain scenario only: employee tasks that send the request BACK ("إعادة …") before they approve it, per the
   * return routes of the service documentation (§7.1, §9, §10). After each return the flow asserts that the documented
   * previous task opens and that its handler sees the return description in "سجل الطلب".
   */
  readonly returnChain?: {
    /** Return description (≤ 2,000 with the "— إعادة n من …" suffix the flow appends to make each one unique). */
    readonly description: string;
    /** Employee task name → how many times it returns the request before approving. */
    readonly tasks: Record<string, number>;
    /** Branches "المراجعة العامة" sends back with "إعادة للموظف السابق" (labels of its "أختر" list). */
    readonly consolidatedBranches: string[];
    /**
     * Optional: once its other returns are done, "المراجعة العامة" returns the request to the transferee with
     * "طلب بيانات إضافية" — the description and the attachment names the transferee must provide (TP-16316).
     */
    readonly additionalInfo?: { readonly description: string; readonly attachmentNames: string[] };
  };
}

export interface ExplorationTransferData {
  readonly attachment: string;
  /** Text written in every employee description field. */
  readonly employeeNote: string;
  /**
   * Employee tasks answered WITHOUT a comment. Default: "مهمة الرقابة" and "الامتثال الفني" (both use the same block and
   * server action ActionCreateInspectionTask_BL) — any comment there makes the server refuse
   * the response ("تعذر إرسال التقييم", BUG-001, confirmed by QA on 2026-10-31). Remove it once the bug is fixed.
   */
  readonly noCommentTasks: string[];
  readonly transfereeWizard: {
    readonly geologists: string[];
    readonly consultant: { readonly name: string; readonly yearsOfExperience: string };
    readonly transferJustifications: string;
    readonly financial: { readonly proofType: string; readonly availableBalance: string };
    readonly socialImpactEmployee: { name: string; nationalId: string; position: string; mobile: string; email: string };
  };
  readonly scenarios: Record<TransferScenarioKey, TransferScenario>;
}

const SCENARIO_DEFAULTS: Omit<TransferScenario, 'licenseNumber' | 'transfereeCR'> = {
  transferor: 'investor3',
  transferee: 'investor2',
  employee: 'employee1',
  equipmentOnSite: false,
  subsidiary: false,
  gisRecommendation: 'أرض متاحة',
  gisClauses: [],
};

export function defaultExplorationTransferData(): Omit<ExplorationTransferData, 'scenarios'> & {
  scenarios: Record<TransferScenarioKey, Omit<TransferScenario, 'licenseNumber' | 'transfereeCR'>>;
} {
  const issuance = explorationLicenseData();
  return {
    attachment: issuance.attachment,
    employeeNote: 'تمت المراجعة - اختبار آلي',
    noCommentTasks: ['مهمة الرقابة', 'الامتثال الفني'],
    transfereeWizard: {
      geologists: [], // empty = the first registered expert of the transferee company
      // TP-16892: alphabet-only name ≤ 50; experience numeric, max 2 digits, > 5 years.
      consultant: { name: 'مستشار اختبار', yearsOfExperience: '10' },
      transferJustifications: 'تحويل الرخصة لاستكمال أعمال الكشف - اختبار آلي',
      financial: { proofType: 'كشف الحساب البنكي', availableBalance: '150000' },
      // TP-16993: ID 10 digits starting 1; mobile starts 05 (max 10 digits).
      socialImpactEmployee: {
        name: 'محمد أحمد',
        nationalId: saudiNationalId('1'),
        position: 'مدير المجتمع',
        mobile: `0${saudiMobile()}`,
        email: testEmail('community.manager'),
      },
    },
    scenarios: {
      availableLand: { ...SCENARIO_DEFAULTS },
      conditionedLand: {
        ...SCENARIO_DEFAULTS,
        gisRecommendation: 'أرض مشروطة',
        gisClauses: ['الالتزام بعدم تجاوز حدود الموقع المعتمد - اختبار آلي'],
      },
      rework: {
        ...SCENARIO_DEFAULTS,
        rework: {
          section: 'الأثر الاجتماعي',
          description: 'يرجى تحديث بيانات المكلف بالأداء المجتمعي - اختبار آلي',
          // Two returns, each correcting the social-impact employee's position (TP-16993: alphabetic, ≤ 100).
          returns: [{ 'الوظيفة': 'مسؤول المجتمع المحلي' }, { 'الوظيفة': 'مدير علاقات المجتمع' }],
        },
      },
      // Every return route the documentation allows on a positive path: two social-impact returns and one financial
      // return to the transferee, then one return from each review / approval task back to its previous employee.
      returnChain: {
        ...SCENARIO_DEFAULTS,
        rework: {
          section: 'الأثر الاجتماعي',
          description: 'يرجى تحديث بيانات المكلف بالأداء المجتمعي - اختبار آلي',
          returns: [{ 'الوظيفة': 'مسؤول المجتمع المحلي' }, { 'الوظيفة': 'مدير علاقات المجتمع' }],
          employeeReturn: {
            branches: ['تقييم القدرة المالية', 'تقييم القدرة الفنية'],
            description: 'يرجى إعادة تقييم القدرة المالية - اختبار آلي',
            corrections: { 'الرصيد المتاح': '200000' },
          },
        },
        returnChain: {
          description: 'يرجى إعادة المراجعة - اختبار آلي لمسار الإعادة',
          tasks: {
            'مراجعة نظم المعلومات الجغرافية': 1,
            'مراجعة تقييم القدرة المالية': 1,
            'المراجعة العامة': 1,
            'المراجعة المبدئية': 1,
            'التقييم النهائي': 1,
            'موافقة المستوى الاول': 1,
            'موافقة المستوى الثاني': 1,
            'موافقة المستوى الثالث': 1,
            'موافقة المستوى الرابع': 1,
            'موافقة المستوى الخامس': 1,
          },
          consolidatedBranches: ['تقييم القدرة المالية', 'تقييم القدرة الفنية', 'الامتثال الفني'],
        },
      },
    },
  };
}

/** SCENARIO name in env vars: availableLand → AVAILABLE_LAND. */
function envKey(scenario: TransferScenarioKey): string {
  return scenario.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
}

export function transferEnvVarNames(scenario: TransferScenarioKey) {
  return {
    licenseNumber: `TRANSFER_${envKey(scenario)}_LICENSE_NUMBER`,
    transfereeCR: `TRANSFER_${envKey(scenario)}_TRANSFEREE_CR`,
  };
}

/** Defaults + JSON overrides + env-var overrides, validated. Only the requested scenario is validated. */
export function explorationTransferData(scenario: TransferScenarioKey): ExplorationTransferData & { scenario: TransferScenario } {
  const merged = deepMerge(
    defaultExplorationTransferData() as unknown as ExplorationTransferData,
    loadOptionalTestData<ExplorationTransferData>('exploration-transfer'),
  );
  const vars = transferEnvVarNames(scenario);
  const chosen = {
    ...merged.scenarios[scenario],
    licenseNumber: readVar(vars.licenseNumber) ?? merged.scenarios[scenario]?.licenseNumber,
    transfereeCR: readVar(vars.transfereeCR) ?? merged.scenarios[scenario]?.transfereeCR,
  } as TransferScenario;

  const where = `test-data/${getEnvName()}/exploration-transfer.json → scenarios.${scenario}`;
  const problems: string[] = [];
  if (!chosen.licenseNumber) problems.push(`licenseNumber is not set (${where}.licenseNumber or ${vars.licenseNumber})`);
  else if (!/^\d{6,}$/.test(String(chosen.licenseNumber))) problems.push(`licenseNumber "${chosen.licenseNumber}" must contain digits only`);
  if (!chosen.transfereeCR) problems.push(`transfereeCR is not set (${where}.transfereeCR or ${vars.transfereeCR})`);
  else if (!/^\d{10}$/.test(String(chosen.transfereeCR))) problems.push(`transfereeCR "${chosen.transfereeCR}" must be exactly 10 digits`);
  if (chosen.gisRecommendation === 'أرض مشروطة' && !chosen.gisClauses?.length) problems.push('conditioned land needs at least one gisClauses entry');
  if (scenario === 'rework' && !chosen.rework) problems.push('the rework scenario needs a "rework" block (section, description, returns)');
  if (scenario === 'returnChain' && !chosen.returnChain) problems.push('the returnChain scenario needs a "returnChain" block (description, tasks, consolidatedBranches)');
  problems.push(...documentedRuleViolations(merged, chosen));
  if (problems.length) {
    throw new ConfigError(`Exploration Transfer scenario "${scenario}" (${getEnvName().toUpperCase()}):\n${problems.map((p) => `   - ${p}`).join('\n')}`);
  }
  return { ...merged, scenario: { ...chosen, licenseNumber: String(chosen.licenseNumber), transfereeCR: String(chosen.transfereeCR) } };
}

/**
 * Field rules from the service documentation (Exploration_Transfer_Service_Documentation.pdf, v1.0 2026-10-30),
 * checked up front so a misconfigured value fails here with a clear message instead of mid-workflow on the server.
 */
function documentedRuleViolations(d: ExplorationTransferData, s: TransferScenario): string[] {
  const problems: string[] = [];
  const max = (label: string, value: string, limit: number) => {
    if (value.length > limit) problems.push(`${label} is ${value.length} characters; the documented maximum is ${limit}`);
  };
  // TP-17056: GIS clause ≤ 5,000; TP-16304: evaluation clause ≤ 2,000 — the same clauses can go to both, so 2,000.
  s.gisClauses.forEach((c, i) => max(`gisClauses[${i}]`, c, 2_000));
  // TP-16892: consultant name alphabetic ≤ 50; experience numeric, max 2 digits, > 5 years.
  const w = d.transfereeWizard;
  max('transfereeWizard.consultant.name', w.consultant.name, 50);
  if (/\d/.test(w.consultant.name)) problems.push('transfereeWizard.consultant.name must contain letters only');
  if (!/^\d{1,2}$/.test(w.consultant.yearsOfExperience) || Number(w.consultant.yearsOfExperience) <= 5) {
    problems.push(`transfereeWizard.consultant.yearsOfExperience "${w.consultant.yearsOfExperience}" must be 1–2 digits and more than 5`);
  }
  // TP-16991: transfer justifications required, ≤ 2,000.
  if (!w.transferJustifications.trim()) problems.push('transfereeWizard.transferJustifications is required');
  max('transfereeWizard.transferJustifications', w.transferJustifications, 2_000);
  // TP-16992: available balance > 0.
  if (!(Number(w.financial.availableBalance) > 0)) problems.push('transfereeWizard.financial.availableBalance must be a number above 0');
  // TP-16993: name/position alphabetic ≤ 100; ID numeric ≤ 10 starting 1; phone numeric ≤ 10 starting 05; email ≤ 100.
  const e = w.socialImpactEmployee;
  max('socialImpactEmployee.name', e.name, 100);
  max('socialImpactEmployee.position', e.position, 100);
  if (!/^1\d{0,9}$/.test(e.nationalId)) problems.push(`socialImpactEmployee.nationalId "${e.nationalId}" must be numeric, max 10 digits, starting with 1`);
  if (!/^05\d{0,8}$/.test(e.mobile)) problems.push(`socialImpactEmployee.mobile "${e.mobile}" must be numeric, max 10 digits, starting with 05`);
  max('socialImpactEmployee.email', e.email, 100);
  // TP-16309: Not-Met description ≤ 5,000; TP-16316: Return to Transferee description ≤ 2,000 — the same text, so 2,000.
  if (s.rework) {
    max('rework.description', s.rework.description, 2_000);
    if (!s.rework.returns?.length) problems.push('rework.returns needs at least one correction (one entry per return to the transferee)');
    s.rework.returns?.forEach((r, i) => Object.entries(r).forEach(([k, v]) => max(`rework.returns[${i}].${k}`, v, 100)));
  }
  // TP-16316 / approval levels: return description mandatory, ≤ 2,000 (reviews allow 5,000) — 100 kept for the suffix.
  if (s.returnChain) {
    const c = s.returnChain;
    if (!c.description.trim()) problems.push('returnChain.description is required (return descriptions are mandatory)');
    max('returnChain.description', c.description, 1_900);
    Object.entries(c.tasks).forEach(([task, n]) => {
      if (!Number.isInteger(n) || n < 0) problems.push(`returnChain.tasks["${task}"] must be a whole number ≥ 0 (got ${n})`);
    });
    if (c.tasks['المراجعة العامة'] && !c.consolidatedBranches?.length) problems.push('returnChain.consolidatedBranches needs at least one branch when "المراجعة العامة" returns');
    // TP-16316: additional-information description ≤ 2,000; one or more attachment names, each ≤ 100.
    if (c.additionalInfo) {
      if (!c.additionalInfo.description.trim()) problems.push('returnChain.additionalInfo.description is required');
      max('returnChain.additionalInfo.description', c.additionalInfo.description, 2_000);
      if (!c.additionalInfo.attachmentNames?.length) problems.push('returnChain.additionalInfo.attachmentNames needs at least one name');
      c.additionalInfo.attachmentNames?.forEach((n, i) => max(`returnChain.additionalInfo.attachmentNames[${i}]`, n, 100));
    }
  }
  return problems;
}

/** CR for logs and reports: only the last 4 digits are shown. */
export function maskCR(cr: string): string {
  return cr.length > 4 ? `${'*'.repeat(cr.length - 4)}${cr.slice(-4)}` : cr;
}
