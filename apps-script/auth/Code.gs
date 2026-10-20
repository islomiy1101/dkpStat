/**
 * DKP Namangan Monitoring — Auth backend (Google Apps Script)
 *
 * O'RNATISH:
 *  1. Users va Logs varaqlari bor Google Sheet'ni oching → Extensions → Apps Script.
 *  2. Shu faylni Code.gs ga joylang.
 *  3. Project Settings → Script Properties → "API_SECRET" qo'shing (uzun tasodifiy satr).
 *     Xuddi shu qiymat Next.js .env.local dagi AUTH_APPS_SCRIPT_SECRET ga yoziladi.
 *  4. Deploy → New deployment → Web app:
 *       Execute as: Me,  Who has access: Anyone
 *     Olingan .../exec URL → AUTH_APPS_SCRIPT_URL.
 *  5. Sheet'ni hech kim bilan "havola orqali" ulashmang — unga faqat shu skript murojaat qiladi.
 *
 * BAZAGA YUKLASH (importSheets — /upload sahifasi, faqat superadmin):
 *  6. Pastdagi IMPORT_TARGETS ga (yoki Script Properties → "IMPORT_TARGETS" ga JSON qilib) yozing —
 *     qaysi sheet'ning qaysi varaqlariga yozish mumkin:
 *       {"<PAYMENT_SHEET_ID>": ["TolovBaza"], "<DEADLINE_SHEET_ID>": ["YakunlanganArizalar", "JarayondagiArizalar"]}
 *  7. Skript egasi (Execute as: Me) shu sheet'larga "Editor" huquqiga ega bo'lishi kerak.
 *  8. Kod o'zgargach: Deploy → Manage deployments → Edit → Version: New version (URL o'zgarmaydi).
 *     Birinchi marta openById uchun ruxsat so'raladi — muharrirda istalgan funksiyani bir marta ishga tushiring.
 *  Har bir yuklash UploadLogs varag'iga yoziladi.
 *
 * REGTEST (/regtest — registratorlar testi):
 *  9. Pastdagi REGTEST_SHEET_ID ga savollar sheet'i ID'sini yozing (faqat muharrirda). Sheet ochiq ulashilmaydi —
 *     skript egasi unga Editor bo'lishi kifoya. Varaqlar: "Тест саволлари" (№ | Савол | а) | б) | в) | г) | Тўғри жавоб)
 *     va "Натижалар" (sarlavhasini skript o'zi yozadi): registratordan faqat Login, qolgani — test yechgan xodim (PINFL, F.I.O.).
 *
 * VARAQLAR (1-qator — sarlavha, ustunlar tartibi muhim emas, nomi bo'yicha topiladi):
 *  Users: Branch | FullName | Department | Login | Password | Role
 *         | MustChangePassword | PasswordChangedAt | BlockedUntil | BlockReason | SessionsRevokedAt  (avtomatik qo'shiladi)
 *         Role: engineer | advicer | accountant | branchManager | headOfDepartment | reception | registrator | superadmin
 *
 *  YANGI XODIM (sayt → Foydalanuvchilar → "Yangi foydalanuvchi", yoki shu varaqqa qo'lda):
 *         Branch, FullName, Department, Login, Role va Password'ga istalgan vaqtinchalik parol yoziladi —
 *         xodim birinchi kirishda uni yangi murakkab parolga almashtiradi.
 *  TAHRIRLASH (sayt → Foydalanuvchilar → ✏️): F.I.O., filial, bo'lim, rol; rol yoki filial o'zgarsa
 *         xodimning ochiq sessiyalari yopiladi va u qayta kirganda yangi huquqlar bilan ishlaydi.
 *  BLOKLASH (sayt → Foydalanuvchilar → "Bloklash", yoki qo'lda): BlockedUntil = "2026-10-25 18:00" yoki "muddatsiz".
 *         Muddat o'tgach avtomatik ochiladi; ochiq sessiyalar ~1 daqiqada yopiladi (SessionsRevokedAt).
 *  Logs : Branch | FullName | Department | Login | DateTime | Ip | Location | Accuracy
 *         (Accuracy — joylashuv xatoligi, metr; ustun bo'lmasa avtomatik qo'shiladi)
 *
 * Parol formatlari: oddiy matn, "sha256:<hex>" (eski) yoki "pbkdf:<iter>:<salt>:<hex>" (sayt orqali o'rnatilgan).
 * Oddiy matn va sha256 parollar ishlaydi, lekin keyingi kirishda yangi murakkab parol so'raladi.
 * Parol talablari — passwordProblem_ (lib/password-policy.ts bilan bir xil).
 */

const USERS_SHEET = "Users";
const LOGS_SHEET = "Logs";
const LOG_HEADERS = ["Branch", "FullName", "Department", "Login", "DateTime", "Ip", "Location", "Accuracy"];
const TZ = "Asia/Tashkent";
const MAX_FAILS = 5;            // ketma-ket noto'g'ri urinishlar
const LOCK_SECONDS = 10 * 60;   // bloklash muddati
const UPLOAD_LOGS_SHEET = "UploadLogs";
const UPLOAD_LOG_HEADERS = ["DateTime", "Login", "FullName", "Section", "FileName", "Sheets", "Rows", "Status"];
const BACKUP_SUFFIX = "__backup";

/**
 * Bazaga yuklash ruxsatlari: qaysi sheet'ning qaysi varaqlariga yozish mumkin.
 * Script Properties'dagi "IMPORT_TARGETS" bo'lsa — o'sha ishlatiladi, bo'lmasa shu yerdagi qiymat.
 * Sheet ID'larni FAQAT Apps Script muharririda yozing (repozitoriyda bo'sh qolsin — Netlify secrets scan).
 */
const IMPORT_TARGETS = {
  // "<PAYMENT_SHEET_ID>": ["TolovBaza"],
  // "<DEADLINE_SHEET_ID>": ["YakunlanganArizalar", "JarayondagiArizalar", "YakunlanganSvod", "JarayondagiSvod"],
};

/**
 * RegTest: savollar banki va natijalar sheet'i. ID FAQAT muharrirda yoziladi (repozitoriyda bo'sh).
 * So'rovda sheet ID kelmaydi — skript faqat shu sheet'ni o'qiydi/yozadi.
 */
const REGTEST_SHEET_ID = "1U3nM3ofXebqPQhYHFkq4Et-gb-_VaJg_umOUOHhvyms";
const REGTEST_QUESTIONS_SHEET = "Тест саволлари";
const REGTEST_RESULTS_SHEET = "Натижалар";
/** Bitta PINFL — shuncha soatda bir marta (boshlangan test bo'yicha) */
const REGTEST_RETAKE_HOURS = 2;
/** Sayt shu raqamga qarab skript eskirganini aniqlaydi (ping → regtestVersion) */
const REGTEST_VERSION = 9;
// Registratordan faqat login (u tizimga kirib beradi); qolgani — test yechgan xodimniki (PINFL)
const REGTEST_HEADERS = ["Sana", "Vaqt", "Login", "PINFL", "F.I.O.", "Savol soni", "To'g'ri", "Noto'g'ri", "Javobsiz", "Ball",
  "Sarflangan vaqt", "Holat", "Qoidabuzarlik", "Test ID"];

function doPost(e) {
  let result;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const secret = String(PropertiesService.getScriptProperties().getProperty("API_SECRET") || "").trim();
    const given = String(req.secret || "").trim();
    if (!secret) {
      result = { success: false, message: "Forbidden: Script Properties'da API_SECRET topilmadi" };
    } else if (given !== secret) {
      result = { success: false, message: "Forbidden: secret mos emas (.env AUTH_APPS_SCRIPT_SECRET ≠ API_SECRET)" };
    } else if (req.action === "login") {
      result = login_(req.login, req.password, req.ip, req.location, req.accuracy);
    } else if (req.action === "getLogs") {
      result = getLogs_(Number(req.limit) || 5000);
    } else if (req.action === "importSheets") {
      result = importSheets_(req.spreadsheetId, req.sheets, req.meta || {});
    } else if (req.action === "deadlineRepair") {
      result = deadlineRepair_(req.spreadsheetId, req.raw, req.svod);
    } else if (req.action === "importChunk") {
      result = importChunk_(req.spreadsheetId, req.name, req.chunk || {}, req.meta || {});
    } else if (req.action === "regtestQuestions") {
      result = regtestQuestions_();
    } else if (req.action === "regtestStart") {
      result = regtestStart_(req.row || {});
    } else if (req.action === "regtestSave") {
      result = regtestSave_(req.row || {});
    } else if (req.action === "regtestResults") {
      result = regtestResults_();
    } else if (req.action === "verifyPassword") {
      result = verifyPassword_(req.login, req.password);
    } else if (req.action === "changePassword") {
      result = changePassword_(req.login, req.current, req.next);
    } else if (req.action === "resetPassword") {
      result = resetPassword_(req.admin, req.login);
    } else if (req.action === "listUsers") {
      result = listUsers_(req.admin);
    } else if (req.action === "createUser") {
      result = createUser_(req.admin, req.user || {});
    } else if (req.action === "updateUser") {
      result = updateUser_(req.admin, req.login, req.changes || {});
    } else if (req.action === "blockUser") {
      result = blockUser_(req.admin, req.login, req.until, req.reason);
    } else if (req.action === "unblockUser") {
      result = unblockUser_(req.admin, req.login);
    } else if (req.action === "authState") {
      result = authState_();
    } else if (req.action === "ping") {
      // Sayt "Bazaga yuklash" sahifasida shu jadvalga havola ko'rsatadi (AUTH_SHEET_ID berilmagan bo'lsa)
      result = { success: true, spreadsheetId: ss_().getId(), regtestVersion: REGTEST_VERSION };
    } else {
      result = { success: false, message: "Noma'lum amal" };
    }
  } catch (err) {
    result = { success: false, message: "Server xatoligi: " + err };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// GET so'rovlarga hech narsa bermaymiz
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ success: false, message: "POST only" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- helpers ---------------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function clean_(s) { return String(s == null ? "" : s).trim(); }

function headerIndex_(headerRow) {
  const map = {};
  headerRow.forEach(function (h, i) { map[clean_(h).toLowerCase()] = i; });
  return function (name) {
    const i = map[name.toLowerCase()];
    if (i === undefined) throw new Error("Ustun topilmadi: " + name);
    return i;
  };
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

function bytesHex_(bytes) {
  return bytes.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

/** PBKDF2-HMAC-SHA256 (bitta blok): har bir foydalanuvchiga alohida salt, iter marta takrorlanadi */
function pbkdf_(password, salt, iter) {
  const key = Utilities.newBlob(password).getBytes();
  let u = Utilities.computeHmacSha256Signature(Utilities.newBlob(salt).getBytes().concat([0, 0, 0, 1]), key);
  const out = u.slice();
  for (let i = 1; i < iter; i++) {
    u = Utilities.computeHmacSha256Signature(u, key);
    for (let j = 0; j < out.length; j++) out[j] ^= u[j];
  }
  return bytesHex_(out);
}

const PBKDF_ITER = 500;

function hashPasswordStrong_(password) {
  const salt = Utilities.getUuid().replace(/-/g, "");
  return "pbkdf:" + PBKDF_ITER + ":" + salt + ":" + pbkdf_(password, salt, PBKDF_ITER);
}

function passwordMatches_(stored, input) {
  stored = clean_(stored);
  if (stored.indexOf("pbkdf:") === 0) {
    const p = stored.split(":");
    return p.length === 4 && pbkdf_(input, p[2], Number(p[1]) || PBKDF_ITER) === p[3].toLowerCase();
  }
  if (stored.indexOf("sha256:") === 0) return stored.slice(7).toLowerCase() === sha256Hex_(input);
  return stored === input;
}

/* ---------------- parol talablari (lib/password-policy.ts bilan bir xil) ---------------- */

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 64;

/** Birinchi bajarilmagan talab yoki null */
function passwordProblem_(pw, login) {
  pw = String(pw == null ? "" : pw);
  const lg = clean_(login).toLowerCase();
  if (pw.length < PASSWORD_MIN) return "Parol kamida " + PASSWORD_MIN + " ta belgidan iborat bo'lishi kerak";
  if (pw.length > PASSWORD_MAX) return "Parol " + PASSWORD_MAX + " belgidan oshmasligi kerak";
  if (!/^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`~]+$/.test(pw)) return "Parolda faqat lotin harflari, raqam va belgilar bo'lishi kerak (kirill va probelsiz)";
  if (!/[a-z]/.test(pw)) return "Parolda kichik lotin harfi bo'lishi kerak";
  if (!/[A-Z]/.test(pw)) return "Parolda katta lotin harfi bo'lishi kerak";
  if (!/[0-9]/.test(pw)) return "Parolda raqam bo'lishi kerak";
  if (!/[!@#$%^&*()_+\-=[\]{};:'",.<>/?\\|`~]/.test(pw)) return "Parolda belgi (! @ # $ % & * …) bo'lishi kerak";
  if (lg && pw.toLowerCase().indexOf(lg) !== -1) return "Parolda login bo'lmasligi kerak";
  return null;
}

/** Talablarga mos tasodifiy vaqtinchalik parol (o'xshash belgilar — 0/O, 1/l/I — ishlatilmaydi) */
function tempPassword_() {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const pick = function (set) { return set.charAt(Math.floor(Math.random() * set.length)); };
  const chars = sets.map(pick);
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = chars[i]; chars[i] = chars[j]; chars[j] = t;
  }
  return chars.join("");
}

/** Apps Script muharririda qo'lda ishga tushiring: parolning hash'ini log'ga chiqaradi */
function hashPassword_() {
  const pass = "BU_YERGA_PAROL";
  Logger.log("sha256:" + sha256Hex_(pass));
}

/** Varaqda yo'q sarlavhalarni oxiriga qo'shadi */
function ensureHeaders_(sheet, names) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return clean_(h).toLowerCase(); });
  const missing = names.filter(function (n) { return header.indexOf(n.toLowerCase()) === -1; });
  if (missing.length) sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
}

const USERS_EXTRA_HEADERS = ["MustChangePassword", "PasswordChangedAt", "BlockedUntil", "BlockReason", "SessionsRevokedAt"];
const BLOCK_FOREVER = "muddatsiz";

/** Ixtiyoriy ustun indeksi (yo'q bo'lsa -1) — login_ varaqqa ustun qo'shmasdan o'qiydi */
function optCol_(header, name) {
  return header.map(function (h) { return clean_(h).toLowerCase(); }).indexOf(name.toLowerCase());
}

/**
 * BlockedUntil → ms: "muddatsiz" — Infinity, bo'sh/noto'g'ri — 0.
 * Qo'lda yozilganda ham tushunadi: "2026-10-25 18:00", "25.10.2026 18:00", sana katakchasi (Date).
 */
function blockedUntilMs_(v) {
  if (v instanceof Date) return v.getTime();
  const s = clean_(v);
  if (!s) return 0;
  if (s.toLowerCase() === BLOCK_FOREVER) return Infinity;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  let y, mo, d, h = "0", mi = "0";
  if (m) { y = m[1]; mo = m[2]; d = m[3]; h = m[4] || "23"; mi = m[5] || "59"; }
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s))) { y = m[3]; mo = m[2]; d = m[1]; h = m[4] || "23"; mi = m[5] || "59"; }
  else return 0;
  const pad = function (n) { return ("0" + n).slice(-2); };
  const t = Date.parse(y + "-" + pad(mo) + "-" + pad(d) + "T" + pad(h) + ":" + pad(mi) + ":00+05:00");
  return isNaN(t) ? 0 : t;
}

/** Hozir bloklanganmi; matn — foydalanuvchiga xabar uchun */
function blockInfo_(untilCell, reasonCell) {
  const until = blockedUntilMs_(untilCell);
  if (!(until > Date.now())) return null;
  const reason = clean_(reasonCell);
  const when = until === Infinity ? "" : Utilities.formatDate(new Date(until), TZ, "dd.MM.yyyy HH:mm");
  return {
    until: until,
    text: (when ? "Hisobingiz " + when + " gacha bloklangan." : "Hisobingiz bloklangan.") +
      (reason ? " Sabab: " + reason + "." : "") + " Administratorga murojaat qiling.",
  };
}

/** Users varag'i: ma'lumot va ustun indekslari (yetishmagan qo'shimcha ustunlar qo'shiladi) */
function usersTable_() {
  const sheet = ss_().getSheetByName(USERS_SHEET);
  if (!sheet) return null;
  ensureHeaders_(sheet, USERS_EXTRA_HEADERS);
  const data = sheet.getDataRange().getValues();
  return { sheet: sheet, data: data, col: headerIndex_(data[0]) };
}

function findUserRow_(t, login) {
  const cLogin = t.col("Login");
  for (let r = 1; r < t.data.length; r++) {
    if (clean_(t.data[r][cLogin]).toLowerCase() === login) return r;
  }
  return -1;
}

const truthy_ = function (v) { return /^(1|true|ha|yes)$/i.test(clean_(v)); };

/** Parolni almashtirish shartmi: belgilangan, eski formatda saqlangan yoki talabga javob bermaydi */
function mustChange_(row, col, inputPassword, login) {
  if (truthy_(row[col("MustChangePassword")])) return true;
  if (clean_(row[col("Password")]).indexOf("pbkdf:") !== 0) return true;
  return inputPassword != null && passwordProblem_(inputPassword, login) !== null;
}

const isSuperRole_ = function (role) { return /^(superadmin|admin)$/.test(clean_(role).toLowerCase().replace(/[\s_\-]/g, "")); };

/* ---------------- login ---------------- */

function login_(login, password, ip, location, accuracy) {
  login = clean_(login).toLowerCase();
  password = clean_(password);
  if (!login || !password) return { success: false, message: "Login yoki parol noto'g'ri!" };

  const cache = CacheService.getScriptCache();
  const failKey = "fail_" + login;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) {
    return { success: false, message: "Juda ko'p noto'g'ri urinish. 10 daqiqadan so'ng qayta urinib ko'ring." };
  }

  const sheet = ss_().getSheetByName(USERS_SHEET);
  if (!sheet) return { success: false, message: "Users varag'i topilmadi" };
  const data = sheet.getDataRange().getValues();
  const col = headerIndex_(data[0]);
  const cLogin = col("Login"), cPass = col("Password");

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (clean_(row[cLogin]).toLowerCase() !== login) continue;
    if (!passwordMatches_(row[cPass], password)) break;

    cache.remove(failKey);
    // Bloklangan (muddati o'tmagan) — kirish yo'q; muddati o'tgan blok e'tiborga olinmaydi
    const cBlock = optCol_(data[0], "BlockedUntil");
    const block = cBlock < 0 ? null : blockInfo_(row[cBlock], row[optCol_(data[0], "BlockReason")]);
    if (block) return { success: false, blocked: true, message: block.text };
    // Rol nomi xom holda qaytariladi; Next.js (lib/roles.ts → parseRole) uni normalizatsiya qiladi
    const role = clean_(row[col("Role")]);
    const user = {
      login: clean_(row[cLogin]),
      fullName: clean_(row[col("FullName")]),
      branch: clean_(row[col("Branch")]),
      department: clean_(row[col("Department")]),
      role: role,
    };
    appendLog_(user, ip, location, accuracy);
    // Ustunlar hali qo'shilmagan bo'lishi mumkin — faqat parol formati va talablar bo'yicha
    const hasMust = data[0].some(function (h) { return clean_(h).toLowerCase() === "mustchangepassword"; });
    const must = (hasMust && truthy_(row[col("MustChangePassword")])) ||
      clean_(row[cPass]).indexOf("pbkdf:") !== 0 || passwordProblem_(password, login) !== null;
    return { success: true, user: user, mustChange: must };
  }

  cache.put(failKey, String(fails + 1), LOCK_SECONDS);
  return { success: false, message: "Login yoki parol noto'g'ri!" };
}

function appendLog_(user, ip, location, accuracy) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let sheet = ss_().getSheetByName(LOGS_SHEET);
    if (!sheet) {
      sheet = ss_().insertSheet(LOGS_SHEET);
      sheet.appendRow(LOG_HEADERS);
      sheet.setFrozenRows(1);
    }
    ensureHeaders_(sheet, LOG_HEADERS); // eski Logs varag'iga Accuracy ustuni qo'shiladi
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const col = headerIndex_(header);
    const row = new Array(header.length).fill("");
    row[col("Branch")] = user.branch;
    row[col("FullName")] = user.fullName;
    row[col("Department")] = user.department;
    row[col("Login")] = user.login;
    row[col("DateTime")] = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
    row[col("Ip")] = clean_(ip) || "Noma'lum";
    row[col("Location")] = clean_(location) || "Aniqlanmadi";
    row[col("Accuracy")] = accuracy == null ? "" : Number(accuracy);
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- logs ---------------- */

function getLogs_(limit) {
  const sheet = ss_().getSheetByName(LOGS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { success: true, logs: [] };
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const col = headerIndex_(header);
  const cAcc = header.map(function (h) { return clean_(h).toLowerCase(); }).indexOf("accuracy");
  const count = Math.min(limit, lastRow - 1);
  const rows = sheet.getRange(lastRow - count + 1, 1, count, lastCol).getValues();

  const logs = rows.map(function (r) {
    const dt = r[col("DateTime")];
    return {
      branch: clean_(r[col("Branch")]),
      fullName: clean_(r[col("FullName")]),
      department: clean_(r[col("Department")]),
      login: clean_(r[col("Login")]),
      dateTime: dt instanceof Date ? Utilities.formatDate(dt, TZ, "yyyy-MM-dd HH:mm:ss") : clean_(dt),
      ip: clean_(r[col("Ip")]),
      location: clean_(r[col("Location")]),
      accuracy: cAcc === -1 ? "" : clean_(r[cAcc]),
    };
  }).reverse(); // eng yangisi birinchi

  return { success: true, logs: logs, total: lastRow - 1 };
}

/* ---------------- bazaga yuklash ---------------- */

/**
 * IMPORT_TARGETS bo'yicha ruxsatni tekshirish. Qo'lda kiritishdagi odatiy xatolar kechiriladi:
 * kalit sifatida to'liq havola, bo'sh joylar, "egri" qo'shtirnoqlar. Ruxsat bo'lsa — null, aks holda aniq sabab.
 */
function checkImportTarget_(spreadsheetId, names) {
  const raw = String(PropertiesService.getScriptProperties().getProperty("IMPORT_TARGETS") || "")
    .replace(/[“”„«»]/g, '"').trim();
  let parsed = IMPORT_TARGETS;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return "Script Properties'dagi IMPORT_TARGETS JSON emas: " + e + ". Namuna: {\"<SHEET_ID>\": [\"TolovBaza\"]}";
    }
  }
  if (!Object.keys(parsed).length) return "IMPORT_TARGETS bo'sh: Code.gs boshidagi IMPORT_TARGETS ga yoki Script Properties'ga sheet ID'larni yozing";
  const id = clean_(spreadsheetId);
  let list = null;
  Object.keys(parsed).forEach(function (k) {
    const m = String(k).match(/\/d\/([\w-]+)/);
    if (clean_(m ? m[1] : k) === id) list = (list || []).concat(parsed[k] || []);
  });
  const tail = "…" + id.slice(-6);
  const where = raw ? "Script Properties → IMPORT_TARGETS" : "Code.gs → IMPORT_TARGETS";
  if (!list) {
    const keys = Object.keys(parsed).map(function (k) { return "…" + clean_(k).slice(-6); }).join(", ") || "yo'q";
    return where + "'da bu sheet ID yo'q (" + tail + "). Kiritilgan ID'lar: " + keys;
  }
  const ok = list.map(function (n) { return clean_(n).toLowerCase(); });
  const denied = names.filter(function (n) { return ok.indexOf(clean_(n).toLowerCase()) === -1; });
  if (denied.length) {
    return "Ruxsat etilmagan varaq(lar): " + denied.join(", ") + " — " + where + "'da " + tail + " uchun faqat: " + (list.join(", ") || "bo'sh");
  }
  return null;
}

/** Next.js { $date: "YYYY-MM-DDTHH:mm:ss" } → Date (skript vaqt zonasida) */
function toCell_(v) {
  if (v && typeof v === "object" && v.$date) {
    const m = String(v.$date).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return String(v.$date);
  }
  return v == null ? "" : v;
}

/**
 * Bir sheet'dagi bir nechta varaqni to'liq almashtirish.
 * 1) har bir varaqdan yashirin zaxira nusxa  2) tozalash va yozish
 * 3) muvaffaqiyat — zaxiralar o'chiriladi; xato — HAMMA varaq zaxiradan tiklanadi.
 */
function importSheets_(spreadsheetId, sheets, meta) {
  const names = (sheets || []).map(function (s) { return String(s.name); });
  if (!names.length) return { success: false, message: "Yoziladigan varaq yo'q" };
  const denied = checkImportTarget_(spreadsheetId, names);
  if (denied) return { success: false, message: denied };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const backups = [];
  const rows = {};
  try {
    // 1) zaxira
    sheets.forEach(function (s) {
      const sheet = ss.getSheetByName(s.name) || ss.insertSheet(s.name);
      const old = ss.getSheetByName(s.name + BACKUP_SUFFIX);
      if (old) ss.deleteSheet(old);
      const backup = sheet.copyTo(ss).setName(s.name + BACKUP_SUFFIX);
      backup.hideSheet();
      backups.push({ sheet: sheet, backup: backup });
    });

    // 2) yozish
    try {
      sheets.forEach(function (s, i) {
        const sheet = backups[i].sheet;
        const values = (s.values || []).map(function (r) { return r.map(toCell_); });
        if (!values.length) throw new Error(s.name + ": ma'lumot yo'q");
        const width = values[0].length;
        sheet.clearContents();
        if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
        if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
        sheet.getRange(1, 1, values.length, width).setValues(values);
        rows[s.name] = values.length - 1;
      });
      SpreadsheetApp.flush();
    } catch (err) {
      // 3a) tiklash
      backups.forEach(function (b) {
        b.sheet.clearContents();
        b.backup.getDataRange().copyTo(b.sheet.getRange(1, 1));
      });
      SpreadsheetApp.flush();
      logUpload_(meta, names, rows, "XATO: " + err);
      return { success: false, message: "Yozishda xatolik, eski ma'lumot tiklandi: " + err };
    }

    // 3b) zaxiralarni o'chirish
    backups.forEach(function (b) { ss.deleteSheet(b.backup); });
    logUpload_(meta, names, rows, "OK");
    return { success: true, rows: rows };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Katta varaqni qismlab yozish (Rollar kesimida tahlil: ~100 ming qator × ~80 ustun).
 * Zaxira nusxa olinmaydi: nusxa bilan Google Sheets'ning 10 mln katak chegarasidan oshib ketadi.
 * chunk: { startRow (1 dan), values, reset (birinchi qism), totalRows, width, last, asText }
 *  - reset: varaq kerakli o'lchamga keltiriladi (avval kengaytiriladi — chegara xatosi bo'lsa eski ma'lumot saqlanadi),
 *           keyin tozalanadi va ortiqcha qator/ustunlar o'chiriladi (katak chegarasini tejash);
 *  - asText: kataklar matn formatida ("@") — raqamga o'xshash ID'lar raqamga aylanmaydi.
 */
function importChunk_(spreadsheetId, name, chunk, meta) {
  name = String(name || "");
  const denied = checkImportTarget_(spreadsheetId, [name]);
  if (denied) return { success: false, message: denied };
  const values = (chunk.values || []).map(function (r) { return r.map(toCell_); });
  const startRow = Number(chunk.startRow) || 0;
  const width = Number(chunk.width) || 0;
  const totalRows = Number(chunk.totalRows) || 0;
  if (!values.length || startRow < 1 || width < 1 || startRow + values.length - 1 > totalRows) {
    return { success: false, message: "Qism ma'lumotlari noto'g'ri" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (chunk.reset) {
      if (sheet.getMaxRows() < totalRows) sheet.insertRowsAfter(sheet.getMaxRows(), totalRows - sheet.getMaxRows());
      if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
      sheet.clearContents();
      if (sheet.getMaxRows() > totalRows) sheet.deleteRows(totalRows + 1, sheet.getMaxRows() - totalRows);
      if (sheet.getMaxColumns() > width) sheet.deleteColumns(width + 1, sheet.getMaxColumns() - width);
    }
    const range = sheet.getRange(startRow, 1, values.length, width);
    if (chunk.asText) range.setNumberFormat("@");
    range.setValues(values);
    SpreadsheetApp.flush();
    if (chunk.last) {
      const rows = {};
      rows[name] = totalRows;
      logUpload_(meta, [name], rows, "OK");
    }
    return { success: true };
  } catch (err) {
    const rows = {};
    rows[name] = (startRow - 1) + " / " + totalRows;
    logUpload_(meta, [name], rows, "XATO (qisman yozildi): " + err);
    return { success: false, message: name + ": " + startRow + "-qatordan yozishda xatolik: " + err };
  } finally {
    lock.releaseLock();
  }
}

function logUpload_(meta, names, rows, status) {
  try {
    let sheet = ss_().getSheetByName(UPLOAD_LOGS_SHEET);
    if (!sheet) {
      sheet = ss_().insertSheet(UPLOAD_LOGS_SHEET);
      sheet.appendRow(UPLOAD_LOG_HEADERS);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([
      Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss"),
      clean_(meta.login), clean_(meta.fullName), clean_(meta.section), clean_(meta.fileName),
      names.join(", "),
      names.map(function (n) { return n + ": " + (rows[n] == null ? "-" : rows[n]); }).join(", "),
      status,
    ]);
  } catch (e) {
    // jurnalga yozilmasa ham yuklash natijasi o'zgarmaydi
  }
}

/* ---------------- RegTest ---------------- */

function regtestBook_() {
  if (!REGTEST_SHEET_ID) throw new Error("Code.gs → REGTEST_SHEET_ID to'ldirilmagan");
  return SpreadsheetApp.openById(REGTEST_SHEET_ID);
}

/** Savollar varag'i ko'rinishdagi matn sifatida (to'g'ri javoblar faqat serverga — brauzerga emas) */
function regtestQuestions_() {
  const sheet = regtestBook_().getSheetByName(REGTEST_QUESTIONS_SHEET);
  if (!sheet) return { success: false, message: "\"" + REGTEST_QUESTIONS_SHEET + "\" varag'i topilmadi" };
  return { success: true, rows: sheet.getDataRange().getDisplayValues() };
}

/** Sarlavhani solishtirish: katta-kichik harf, apostrof turlari, qavs ichidagi izoh va bo'sh joyga befarq */
function regtestKey_(h) {
  const k = clean_(h).toLowerCase().replace(/\(.*?\)/g, "").replace(/[`'ʻ’‘ʼ.\s]/g, "");
  // F.I.O. ustunining boshqa yozilishlari: FIO, Ф.И.О., F.I.SH, Xodim FIO
  return ["фио", "fish", "фиш", "xodimfio", "xodimfish"].indexOf(k) >= 0 ? "fio" : k;
}

/** "Натижалар" varag'i; bo'lmasa yoki bo'sh bo'lsa — REGTEST_HEADERS bilan yaratiladi */
function regtestSheet_() {
  const book = regtestBook_();
  const sheet = book.getSheetByName(REGTEST_RESULTS_SHEET) || book.insertSheet(REGTEST_RESULTS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REGTEST_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, REGTEST_HEADERS.length).setFontWeight("bold");
  }
  return sheet;
}

/**
 * Sarlavha → ustun (0 dan). Qiymatlar USTUN TARTIBI bo'yicha emas, SARLAVHA NOMLARI bo'yicha qo'yiladi —
 * ustunlar surilsa, ortiqchasi o'chirilsa yoki qo'shilsa ham yozuv o'z joyiga tushadi. Yetishmagan sarlavha oxiriga qo'shiladi.
 */
function regtestCols_(sheet) {
  let head = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0];
  const colOf = {};
  head.forEach(function (h, i) { if (clean_(h)) colOf[regtestKey_(h)] = i; });
  const added = [];
  REGTEST_HEADERS.forEach(function (name) {
    if (colOf[regtestKey_(name)] === undefined) {
      colOf[regtestKey_(name)] = head.length;
      head = head.concat([name]);
      added.push(name);
    }
  });
  if (added.length) sheet.getRange(1, 1, 1, head.length).setValues([head]);
  return { width: head.length, col: function (name) { return colOf[regtestKey_(name)]; }, added: added };
}

/** Qatorni sarlavha bo'yicha to'ldirish: { "Holat": "…" } → [.., "…", ..] */
function regtestRowValues_(cols, values) {
  const out = [];
  for (let i = 0; i < cols.width; i++) out.push("");
  Object.keys(values).forEach(function (name) { out[cols.col(name)] = values[name]; });
  return out;
}

/**
 * Urinish boshlangan vaqt (ms). Yangi Test ID'lar "vaqt36-tasodifiy" — vaqt ID'ning o'zidan olinadi
 * (Sana/Vaqt kataklari joy sozlamasiga qarab sana yoki matn bo'lishi mumkin). Eski ID'lar uchun — Sana + Vaqt matni.
 */
function regtestStartedAt_(id, sana, vaqt) {
  const m = /^([0-9a-z]{6,12})-/.exec(clean_(id));
  if (m) {
    const t = parseInt(m[1], 36);
    if (t > 1600000000000 && t < 4100000000000) return t;
  }
  sana = clean_(sana);
  vaqt = clean_(vaqt);
  let y, mo, d;
  let p = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(sana);
  if (p) { y = p[1]; mo = p[2]; d = p[3]; }
  else if ((p = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(sana))) { y = p[3]; mo = p[2]; d = p[1]; }
  else if ((p = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(sana))) { y = p[3]; mo = p[1]; d = p[2]; }
  else return 0;
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(vaqt) || [];
  let h = Number(tm[1] || 0);
  if (tm[4] && /pm/i.test(tm[4]) && h < 12) h += 12;
  if (tm[4] && /am/i.test(tm[4]) && h === 12) h = 0;
  const pad2 = function (n) { return ("0" + n).slice(-2); };
  const s = y + "-" + pad2(mo) + "-" + pad2(d) + " " + pad2(h) + ":" + pad2(tm[2] || 0) + ":" + pad2(tm[3] || 0);
  try { return Utilities.parseDate(s, TZ, "yyyy-MM-dd HH:mm:ss").getTime(); } catch (e) { return 0; }
}

/**
 * Test boshlanishi: bitta PINFL — REGTEST_RETAKE_HOURS soatda bir marta (boshlangan testlar bo'yicha —
 * tashlab ketib qayta boshlab, yangi savollarni ko'rib chiqishning oldi olinadi).
 * Ruxsat bo'lsa — "Jarayonda" holatidagi qator qo'shiladi; yakunlanganda shu qator yangilanadi.
 */
function regtestStart_(row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = regtestSheet_();
    const cols = regtestCols_(sheet);
    const id = clean_(row.testId);
    const pinfl = clean_(row.pinfl);
    if (!id || !pinfl) return { success: false, message: "Test ID yoki PINFL yo'q" };

    const now = Date.now();
    const limitMs = REGTEST_RETAKE_HOURS * 3600 * 1000;
    let last = 0;
    if (sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, cols.width).getDisplayValues();
      const cP = cols.col("PINFL"), cId = cols.col("Test ID"), cS = cols.col("Sana"), cV = cols.col("Vaqt");
      data.forEach(function (r) {
        if (clean_(r[cP]).replace(/^'/, "") !== pinfl) return;
        const t = regtestStartedAt_(r[cId], r[cS], r[cV]);
        if (t > last) last = t;
      });
    }
    if (last && now - last < limitMs) {
      const nextAt = Utilities.formatDate(new Date(last + limitMs), TZ, "dd.MM.yyyy HH:mm");
      return {
        success: false, limited: true, nextAt: nextAt,
        message: "Bu PINFL bilan test " + REGTEST_RETAKE_HOURS + " soatda bir marta topshiriladi. Keyingi urinish: " + nextAt + " dan keyin",
      };
    }

    const t = new Date(now);
    sheet.appendRow(regtestRowValues_(cols, {
      "Sana": Utilities.formatDate(t, TZ, "yyyy-MM-dd"),
      "Vaqt": Utilities.formatDate(t, TZ, "HH:mm:ss"),
      "Login": clean_(row.login),
      "PINFL": "'" + pinfl, // matn — boshidagi 0 va 14 xonali raqam yo'qolmasin
      "F.I.O.": clean_(row.fio),
      "Savol soni": Number(row.total) || 0,
      "Holat": "Jarayonda",
      "Test ID": id,
    }));
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Natija: "Jarayonda" qatori Test ID bo'yicha topilib yangilanadi (bitta urinish — bitta qator).
 * Holati "Jarayonda" bo'lmasa — takror yuborilgan (rad etiladi); qator topilmasa (eski testlar) — oxiriga qo'shiladi.
 */
function regtestSave_(row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = regtestSheet_();
    const cols = regtestCols_(sheet);
    const id = clean_(row.testId);
    if (!id) return { success: false, message: "Test ID yo'q" };

    const result = {
      "Login": clean_(row.login),
      "PINFL": "'" + clean_(row.pinfl),
      "F.I.O.": clean_(row.fio),
      "Savol soni": Number(row.total) || 0,
      "To'g'ri": Number(row.correct) || 0,
      "Noto'g'ri": Number(row.wrong) || 0,
      "Javobsiz": Number(row.unanswered) || 0,
      "Ball": Number(row.score) || 0,
      "Sarflangan vaqt": Number(row.spentSec) || 0,
      "Holat": clean_(row.status),
      "Qoidabuzarlik": Number(row.violations) || 0,
      "Test ID": id,
    };

    let found = null;
    if (sheet.getLastRow() > 1) {
      found = sheet.getRange(2, cols.col("Test ID") + 1, sheet.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).findNext();
    }
    if (found) {
      const r = found.getRow();
      const current = sheet.getRange(r, 1, 1, cols.width).getDisplayValues()[0];
      // Bir test — bir natija: token qayta yuborilsa (cookie nusxalanib) — rad etiladi
      if (clean_(current[cols.col("Holat")]) !== "Jarayonda") {
        return { success: false, duplicate: true, message: "Bu test allaqachon yakunlangan" };
      }
      Object.keys(result).forEach(function (name) {
        if (name === "Login" || name === "PINFL" || name === "F.I.O." || name === "Test ID") return; // boshlanishda yozilgan
        sheet.getRange(r, cols.col(name) + 1).setValue(result[name]);
      });
      return { success: true };
    }

    const t = new Date();
    result["Sana"] = Utilities.formatDate(t, TZ, "yyyy-MM-dd");
    result["Vaqt"] = Utilities.formatDate(t, TZ, "HH:mm:ss");
    sheet.appendRow(regtestRowValues_(cols, result));
    return cols.added.length ? { success: true, message: "Varaqqa ustun(lar) qo'shildi: " + cols.added.join(", ") } : { success: true };
  } finally {
    lock.releaseLock();
  }
}

/** "Натижалар" — dashboard uchun (ko'rinishdagi matn sifatida) */
function regtestResults_() {
  const sheet = regtestBook_().getSheetByName(REGTEST_RESULTS_SHEET);
  if (!sheet || sheet.getLastRow() === 0) return { success: true, rows: [] };
  return { success: true, rows: sheet.getDataRange().getDisplayValues() };
}

/**
 * Parolni qayta tekshirish ("Test natijalari"ni ochish uchun). login_ bilan bir xil qoidalar
 * (sha256, 5 ta xato urinishdan keyin 10 daqiqa blok), lekin Logs'ga yozilmaydi.
 */
function verifyPassword_(login, password) {
  login = clean_(login).toLowerCase();
  password = clean_(password);
  if (!login || !password) return { success: false, message: "Parol noto'g'ri" };
  const cache = CacheService.getScriptCache();
  const failKey = "fail_" + login;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) return { success: false, message: "Juda ko'p noto'g'ri urinish. 10 daqiqadan so'ng qayta urinib ko'ring." };

  const sheet = ss_().getSheetByName(USERS_SHEET);
  if (!sheet) return { success: false, message: "Users varag'i topilmadi" };
  const data = sheet.getDataRange().getValues();
  const col = headerIndex_(data[0]);
  const cLogin = col("Login"), cPass = col("Password");
  for (let r = 1; r < data.length; r++) {
    if (clean_(data[r][cLogin]).toLowerCase() !== login) continue;
    if (passwordMatches_(data[r][cPass], password)) {
      cache.remove(failKey);
      return { success: true };
    }
    break;
  }
  cache.put(failKey, String(fails + 1), LOCK_SECONDS);
  return { success: false, message: "Parol noto'g'ri" };
}

/* ---------------- parolni almashtirish ---------------- */

/** Foydalanuvchi o'z parolini almashtiradi: joriy parol tekshiriladi (login bilan umumiy xato urinishlar hisobi) */
function changePassword_(login, current, next) {
  login = clean_(login).toLowerCase();
  current = clean_(current);
  next = String(next == null ? "" : next);
  if (!login || !current) return { success: false, message: "Joriy parolni kiriting" };

  const cache = CacheService.getScriptCache();
  const failKey = "fail_" + login;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) return { success: false, message: "Juda ko'p noto'g'ri urinish. 10 daqiqadan so'ng qayta urinib ko'ring." };

  const problem = passwordProblem_(next, login);
  if (problem) return { success: false, message: problem };
  if (next === current) return { success: false, message: "Yangi parol joriy paroldan farq qilishi kerak" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = usersTable_();
    if (!t) return { success: false, message: "Users varag'i topilmadi" };
    const r = findUserRow_(t, login);
    if (r < 0 || !passwordMatches_(t.data[r][t.col("Password")], current)) {
      cache.put(failKey, String(fails + 1), LOCK_SECONDS);
      return { success: false, wrongCurrent: true, message: "Joriy parol noto'g'ri" };
    }
    cache.remove(failKey);
    writePassword_(t, r, next, false);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function writePassword_(t, r, password, mustChange) {
  const row = r + 1;
  t.sheet.getRange(row, t.col("Password") + 1).setNumberFormat("@").setValue(hashPasswordStrong_(password));
  t.sheet.getRange(row, t.col("MustChangePassword") + 1).setValue(mustChange ? 1 : 0);
  t.sheet.getRange(row, t.col("PasswordChangedAt") + 1).setValue(Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss"));
}

/** So'rov yuborgan foydalanuvchi superadmin ekanini Users varag'idan qayta tekshirish (cookie'ga ishonmaslik uchun) */
function requireSuper_(t, admin) {
  const r = findUserRow_(t, clean_(admin).toLowerCase());
  return r >= 0 && isSuperRole_(t.data[r][t.col("Role")]);
}

/** Superadmin: xodimga vaqtinchalik parol (keyingi kirishda almashtirishi shart). Parol faqat bir marta qaytariladi */
function resetPassword_(admin, login) {
  login = clean_(login).toLowerCase();
  if (!login) return { success: false, message: "Login ko'rsatilmagan" };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = usersTable_();
    if (!t) return { success: false, message: "Users varag'i topilmadi" };
    if (!requireSuper_(t, admin)) return { success: false, message: "Ruxsat yo'q" };
    const r = findUserRow_(t, login);
    if (r < 0) return { success: false, message: "Foydalanuvchi topilmadi" };
    const temp = tempPassword_();
    writePassword_(t, r, temp, true);
    revokeSessions_(t, r);
    CacheService.getScriptCache().remove("fail_" + login); // ko'p xato urinish bloki ochiladi
    return { success: true, password: temp };
  } finally {
    lock.releaseLock();
  }
}

/** Superadmin: foydalanuvchilar ro'yxati (parollarsiz) */
function listUsers_(admin) {
  const t = usersTable_();
  if (!t) return { success: false, message: "Users varag'i topilmadi" };
  if (!requireSuper_(t, admin)) return { success: false, message: "Ruxsat yo'q" };
  const c = t.col;
  const users = [];
  for (let r = 1; r < t.data.length; r++) {
    const row = t.data[r];
    const login = clean_(row[c("Login")]);
    if (!login) continue;
    const at = row[c("PasswordChangedAt")];
    const block = blockInfo_(row[c("BlockedUntil")], row[c("BlockReason")]);
    users.push({
      login: login,
      fullName: clean_(row[c("FullName")]),
      branch: clean_(row[c("Branch")]),
      department: clean_(row[c("Department")]),
      role: clean_(row[c("Role")]),
      mustChange: mustChange_(row, c, null, login),
      changedAt: at instanceof Date ? Utilities.formatDate(at, TZ, "yyyy-MM-dd HH:mm:ss") : clean_(at),
      blocked: !!block,
      blockedUntil: !block ? "" : block.until === Infinity ? BLOCK_FOREVER : Utilities.formatDate(new Date(block.until), TZ, "yyyy-MM-dd HH:mm"),
      blockReason: block ? clean_(row[c("BlockReason")]) : "",
    });
  }
  return { success: true, users: users };
}

/* ---------------- foydalanuvchi qo'shish va bloklash ---------------- */

const USER_ROLES = ["engineer", "advicer", "accountant", "branchManager", "headOfDepartment", "reception", "registrator", "superadmin"];

/** Sessiyalarni bekor qilish: shu vaqtdan oldin ochilgan barcha sessiyalar yopiladi (sayt authState orqali tekshiradi) */
function revokeSessions_(t, r) {
  t.sheet.getRange(r + 1, t.col("SessionsRevokedAt") + 1).setNumberFormat("@").setValue(String(Date.now()));
}

/** Superadmin: yangi xodim — vaqtinchalik parol bilan (birinchi kirishda almashtirishi shart) */
function createUser_(admin, u) {
  const login = clean_(u.login);
  const fullName = clean_(u.fullName).replace(/\s+/g, " ");
  const branch = clean_(u.branch);
  const department = clean_(u.department);
  const role = clean_(u.role);
  if (!fullName || fullName.length > 120) return { success: false, message: "F.I.O.ni kiriting" };
  if (!branch || branch.length > 120) return { success: false, message: "Filialni kiriting" };
  if (!/^[^\s]{3,64}$/.test(login)) return { success: false, message: "Login 3–64 belgidan iborat, probelsiz bo'lishi kerak" };
  if (USER_ROLES.indexOf(role) === -1) return { success: false, message: "Rol noto'g'ri" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = usersTable_();
    if (!t) return { success: false, message: "Users varag'i topilmadi" };
    if (!requireSuper_(t, admin)) return { success: false, message: "Ruxsat yo'q" };
    if (findUserRow_(t, login.toLowerCase()) >= 0) return { success: false, exists: true, message: "Bu login band: " + login };

    const temp = tempPassword_();
    const header = t.data[0];
    const row = new Array(header.length).fill("");
    row[t.col("Branch")] = branch;
    row[t.col("FullName")] = fullName;
    row[t.col("Department")] = department;
    row[t.col("Role")] = role;
    row[t.col("Password")] = hashPasswordStrong_(temp);
    row[t.col("MustChangePassword")] = 1;
    row[t.col("PasswordChangedAt")] = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
    const at = t.sheet.getLastRow() + 1;
    t.sheet.getRange(at, 1, 1, row.length).setValues([row]);
    // Login matn sifatida (raqamli loginlar — PINFL — songa aylanib ketmasin)
    t.sheet.getRange(at, t.col("Login") + 1).setNumberFormat("@").setValue(login);
    return { success: true, password: temp };
  } finally {
    lock.releaseLock();
  }
}

/** Superadmin: bloklash. until — ms (kelajakda) yoki "muddatsiz"; ochiq sessiyalar ham yopiladi */
function blockUser_(admin, login, until, reason) {
  login = clean_(login).toLowerCase();
  if (!login) return { success: false, message: "Login ko'rsatilmagan" };
  if (login === clean_(admin).toLowerCase()) return { success: false, message: "O'zingizni bloklay olmaysiz" };
  const forever = clean_(until).toLowerCase() === BLOCK_FOREVER;
  const ms = Number(until);
  if (!forever && !(ms > Date.now())) return { success: false, message: "Blok muddati kelajakda bo'lishi kerak" };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = usersTable_();
    if (!t) return { success: false, message: "Users varag'i topilmadi" };
    if (!requireSuper_(t, admin)) return { success: false, message: "Ruxsat yo'q" };
    const r = findUserRow_(t, login);
    if (r < 0) return { success: false, message: "Foydalanuvchi topilmadi" };
    const text = forever ? BLOCK_FOREVER : Utilities.formatDate(new Date(ms), TZ, "yyyy-MM-dd HH:mm");
    t.sheet.getRange(r + 1, t.col("BlockedUntil") + 1).setNumberFormat("@").setValue(text);
    t.sheet.getRange(r + 1, t.col("BlockReason") + 1).setValue(clean_(reason).slice(0, 200));
    revokeSessions_(t, r);
    return { success: true, blockedUntil: text };
  } finally {
    lock.releaseLock();
  }
}

function unblockUser_(admin, login) {
  login = clean_(login).toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = usersTable_();
    if (!t) return { success: false, message: "Users varag'i topilmadi" };
    if (!requireSuper_(t, admin)) return { success: false, message: "Ruxsat yo'q" };
    const r = findUserRow_(t, login);
    if (r < 0) return { success: false, message: "Foydalanuvchi topilmadi" };
    t.sheet.getRange(r + 1, t.col("BlockedUntil") + 1, 1, 2).setValues([["", ""]]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sayt har daqiqada so'raydi: faqat hozir bloklanganlar va sessiyalari bekor qilinganlar (oxirgi 30 kun).
 * until: ms yoki null (muddatsiz); revokedAt: ms yoki 0.
 */
function authState_() {
  const sheet = ss_().getSheetByName(USERS_SHEET);
  if (!sheet) return { success: false, message: "Users varag'i topilmadi" };
  const data = sheet.getDataRange().getValues();
  const h = data[0];
  const cLogin = optCol_(h, "Login"), cUntil = optCol_(h, "BlockedUntil"), cRev = optCol_(h, "SessionsRevokedAt");
  const since = Date.now() - 30 * 86400000;
  const out = [];
  for (let r = 1; r < data.length; r++) {
    const login = clean_(data[r][cLogin]).toLowerCase();
    if (!login) continue;
    const until = cUntil < 0 ? 0 : blockedUntilMs_(data[r][cUntil]);
    const rev = cRev < 0 ? 0 : Number(clean_(data[r][cRev])) || 0;
    const blocked = until > Date.now();
    if (!blocked && rev < since) continue;
    out.push({ login: login, until: blocked ? (until === Infinity ? null : until) : 0, revokedAt: rev });
  }
  return { success: true, state: out };
}

/**
 * Superadmin: xodim ma'lumotlarini tahrirlash (login o'zgarmaydi). Rol yoki filial o'zgarsa — sessiyalari yopiladi.
 * O'z rolini o'zgartirish va oxirgi superadmin'ni tushirish taqiqlanadi.
 */
function updateUser_(admin, login, changes) {
  login = clean_(login).toLowerCase();
  if (!login) return { success: false, message: "Login ko'rsatilmagan" };
  const next = {};
  if (changes.fullName != null) next.FullName = clean_(changes.fullName).replace(/\s+/g, " ");
  if (changes.branch != null) next.Branch = clean_(changes.branch);
  if (changes.department != null) next.Department = clean_(changes.department);
  if (changes.role != null) next.Role = clean_(changes.role);
  if (next.FullName !== undefined && (!next.FullName || next.FullName.length > 120)) return { success: false, message: "F.I.O.ni kiriting" };
  if (next.Branch !== undefined && (!next.Branch || next.Branch.length > 120)) return { success: false, message: "Filialni kiriting" };
  if (next.Department !== undefined && next.Department.length > 120) return { success: false, message: "Bo'lim nomi juda uzun" };
  if (next.Role !== undefined && USER_ROLES.indexOf(next.Role) === -1) return { success: false, message: "Rol noto'g'ri" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = usersTable_();
    if (!t) return { success: false, message: "Users varag'i topilmadi" };
    if (!requireSuper_(t, admin)) return { success: false, message: "Ruxsat yo'q" };
    const r = findUserRow_(t, login);
    if (r < 0) return { success: false, message: "Foydalanuvchi topilmadi" };
    const row = t.data[r];

    const changed = Object.keys(next).filter(function (k) { return clean_(row[t.col(k)]) !== next[k]; });
    if (!changed.length) return { success: true, revoked: false };

    if (changed.indexOf("Role") !== -1) {
      if (login === clean_(admin).toLowerCase()) return { success: false, message: "O'z rolingizni o'zgartira olmaysiz" };
      if (isSuperRole_(row[t.col("Role")]) && !isSuperRole_(next.Role)) {
        let supers = 0;
        for (let i = 1; i < t.data.length; i++) if (isSuperRole_(t.data[i][t.col("Role")]) && clean_(t.data[i][t.col("Login")])) supers++;
        if (supers <= 1) return { success: false, message: "Bu yagona superadmin — rolini o'zgartirib bo'lmaydi" };
      }
    }
    changed.forEach(function (k) { t.sheet.getRange(r + 1, t.col(k) + 1).setValue(next[k]); });
    // Rol va filial sessiya cookie'sida — o'zgarsa, xodim qayta kirib yangi huquqlarni oladi
    const revoke = changed.indexOf("Role") !== -1 || changed.indexOf("Branch") !== -1;
    if (revoke) revokeSessions_(t, r);
    return { success: true, revoked: revoke };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Rollar kesimi: eski usulda yuklangan ma'lumotni tuzatish ---------------- */

const SVOD_SPAN_MARK = "#qatorlar";

/**
 * Eski sahifa orqali yuklangan Rollar kesimi ma'lumoti (xom qatorlar saralanmagan, svod'da tuman oraliqlari yo'q):
 * xom varaq tuman (B) bo'yicha saralanadi va svod'ga har bir tumanning qator oralig'i qo'shiladi.
 * Ma'lumot o'zgarmaydi — faqat qatorlar tartibi. Sayt buni o'zi chaqiradi (lib/deadline-server.ts), qayta yuklash shart emas.
 */
function deadlineRepair_(spreadsheetId, rawName, svodName) {
  rawName = String(rawName || "");
  svodName = String(svodName || "");
  const denied = checkImportTarget_(spreadsheetId, [rawName, svodName]);
  if (denied) return { success: false, message: denied };

  const cache = CacheService.getScriptCache();
  const flag = "repair_" + svodName;
  if (cache.get(flag)) return { success: false, running: true, message: "Tayyorlanmoqda" };
  cache.put(flag, "1", 600);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const raw = ss.getSheetByName(rawName);
    const svod = ss.getSheetByName(svodName);
    if (!raw || !svod) return { success: false, message: "Varaq topilmadi" };

    // Allaqachon tuzatilgan yoki yangi usulda yuklangan
    const svodB = svod.getRange(1, 2, Math.max(1, svod.getLastRow()), 1).getDisplayValues();
    if (svodB.some(function (r) { return clean_(r[0]) === SVOD_SPAN_MARK; })) return { success: true, spans: 0, already: true };

    const last = raw.getLastRow();
    if (last < 3) return { success: true, spans: 0 };
    raw.getRange(3, 1, last - 2, raw.getLastColumn()).sort({ column: 2, ascending: true });
    SpreadsheetApp.flush();

    const tum = raw.getRange(3, 2, last - 2, 1).getDisplayValues();
    const spans = [];
    let cur = null;
    tum.forEach(function (r, i) {
      const t = clean_(r[0]);
      if (!t) { cur = null; return; }
      if (cur && cur[0] === t) cur[4] = String(i + 3);
      else { cur = [t, SVOD_SPAN_MARK, "", String(i + 3), String(i + 3)]; spans.push(cur); }
    });
    if (!spans.length) return { success: true, spans: 0 };

    const width = Math.max(5, svod.getLastColumn());
    const rows = spans.map(function (r) { return r.concat(new Array(width - r.length).fill("")); });
    svod.insertRowsAfter(1, rows.length);
    svod.getRange(2, 1, rows.length, width).setNumberFormat("@").setValues(rows);
    return { success: true, spans: rows.length };
  } finally {
    lock.releaseLock();
    cache.remove(flag);
  }
}
