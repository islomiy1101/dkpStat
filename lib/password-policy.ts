/**
 * Parol talablari — bitta joyda: forma (jonli ✓/✗ ro'yxat), Next.js server va Apps Script
 * (apps-script/auth/Code.gs → passwordProblem_ — shu qoidalarning nusxasi, o'zgartirsangiz ikkalasini ham).
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
/** Ruxsat etilgan maxsus belgilar (lotin klaviaturasidagi ASCII belgilar, probelsiz) */
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};:'\",.<>/?\\|`~";

const isSymbol = (ch: string) => PASSWORD_SYMBOLS.includes(ch);
const ALLOWED = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`~]*$/;

export type PasswordRule = { id: string; label: string; ok: boolean };

/** Har bir talab alohida (formadagi ro'yxat uchun); `login` — parolda login bo'lmasligi uchun */
export function passwordRules(pw: string, login = ""): PasswordRule[] {
  const lg = login.trim().toLowerCase();
  return [
    { id: "len", label: `Kamida ${PASSWORD_MIN} ta belgi`, ok: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX },
    { id: "lower", label: "Kichik lotin harfi (a–z)", ok: /[a-z]/.test(pw) },
    { id: "upper", label: "Katta lotin harfi (A–Z)", ok: /[A-Z]/.test(pw) },
    { id: "digit", label: "Raqam (0–9)", ok: /[0-9]/.test(pw) },
    { id: "symbol", label: "Belgi (! @ # $ % & * …)", ok: [...pw].some(isSymbol) },
    { id: "chars", label: "Faqat lotin harflari, raqam va belgilar (kirill va probelsiz)", ok: pw.length > 0 && ALLOWED.test(pw) },
    { id: "login", label: "Login'ni o'z ichiga olmaydi", ok: pw.length > 0 && (!lg || !pw.toLowerCase().includes(lg)) },
  ];
}

export const isStrongPassword = (pw: string, login = "") => passwordRules(pw, login).every((r) => r.ok);

/** Server uchun: birinchi bajarilmagan talab matni yoki null */
export function passwordProblem(pw: string, login = ""): string | null {
  if (pw.length > PASSWORD_MAX) return `Parol ${PASSWORD_MAX} belgidan oshmasligi kerak`;
  const bad = passwordRules(pw, login).find((r) => !r.ok);
  // Faqat birinchi harf kichik: "(A–Z)" kabi qismlar o'zgarmasin
  return bad ? `Parol talabga javob bermaydi: ${bad.label.charAt(0).toLowerCase()}${bad.label.slice(1)}` : null;
}

/** Kuchlilik (0–4) — formadagi chiziq uchun */
export function passwordStrength(pw: string, login = "") {
  const passed = passwordRules(pw, login).filter((r) => r.ok).length;
  if (!pw) return 0;
  if (passed < 5) return 1;
  if (passed < 7) return 2;
  return pw.length >= 12 ? 4 : 3;
}
