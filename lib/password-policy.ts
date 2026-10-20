/**
 * Parol talablari — bitta joyda: forma (jonli ✓/✗ ro'yxat), Next.js server va Apps Script
 * (apps-script/auth/Code.gs → passwordProblem_ — shu qoidaning nusxasi, o'zgartirsangiz ikkalasini ham).
 * Talab: faqat uzunlik (kamida 8 belgi). Probel kiritilmaydi — forma va server uni qabul qilmaydi.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

export type PasswordRule = { id: string; label: string; ok: boolean };

/** Talablar ro'yxati (formadagi ✓/✗ uchun). `login` — avvalgi imzo bilan moslik uchun, ishlatilmaydi */
export function passwordRules(pw: string, _login = ""): PasswordRule[] {
  void _login;
  return [{ id: "len", label: `Kamida ${PASSWORD_MIN} ta belgi`, ok: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX }];
}

export const isStrongPassword = (pw: string, login = "") => passwordRules(pw, login).every((r) => r.ok);

/** Server uchun: xato matni yoki null */
export function passwordProblem(pw: string, _login = ""): string | null {
  void _login;
  if (pw.length < PASSWORD_MIN) return `Parol kamida ${PASSWORD_MIN} ta belgidan iborat bo'lishi kerak`;
  if (pw.length > PASSWORD_MAX) return `Parol ${PASSWORD_MAX} belgidan oshmasligi kerak`;
  if (/\s/.test(pw)) return "Parolda probel bo'lmasligi kerak";
  return null;
}

/** Kuchlilik (0–4) — formadagi chiziq uchun, faqat maslahat (saqlashni to'smaydi) */
export function passwordStrength(pw: string, _login = "") {
  void _login;
  if (!pw) return 0;
  if (pw.length < PASSWORD_MIN) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (pw.length >= 12 && kinds >= 3) return 4;
  return pw.length >= 12 || kinds >= 3 ? 3 : 2;
}
