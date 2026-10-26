/**
 * Generators for values whose format is enforced by the application.
 * Each one encodes a rule observed on TEST — see the comment on each function.
 */

/**
 * Saudi national / iqama number. Rule shown by the app: "رقم الهوية يجب أن يكون رقمًا مكونًا
 * من 10 أرقام ويبدأ بـ 1 أو 2". The last digit is also made Luhn-valid (the official check
 * digit algorithm), so a stricter server-side check will not reject it either.
 */
export function saudiNationalId(prefix: '1' | '2' = '1'): string {
  const body = prefix + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  for (let check = 0; check <= 9; check++) {
    const candidate = body + check;
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let d = Number(candidate[i]);
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    if (sum % 10 === 0) return candidate;
  }
  throw new Error('unreachable: one check digit always satisfies Luhn');
}

/** Saudi mobile without the +966 prefix. Rule: 9 digits starting with 5. */
export function saudiMobile(): string {
  return '5' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
}

/** Address on the reserved example.com domain — never delivers to a real person. */
export function testEmail(local = 'automation'): string {
  return `${local}.${Date.now().toString(36)}@example.com`;
}
