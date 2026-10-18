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
 *  6. Script Properties → "IMPORT_TARGETS" qo'shing — qaysi sheet'ning qaysi varaqlariga yozish mumkin (JSON):
 *       {"<PAYMENT_SHEET_ID>": ["TolovKutilmoqda", "TolovReja"], "<DEADLINE_SHEET_ID>": ["Arizalar"]}
 *  7. Skript egasi (Execute as: Me) shu sheet'larga "Editor" huquqiga ega bo'lishi kerak.
 *  8. Kod o'zgargach: Deploy → Manage deployments → Edit → Version: New version (URL o'zgarmaydi).
 *     Birinchi marta openById uchun ruxsat so'raladi — muharrirda istalgan funksiyani bir marta ishga tushiring.
 *  Har bir yuklash UploadLogs varag'iga yoziladi.
 *
 * VARAQLAR (1-qator — sarlavha, ustunlar tartibi muhim emas, nomi bo'yicha topiladi):
 *  Users: Branch | FullName | Department | Login | Password | Role
 *         Role: engineer | advicer | accountant | branchManager | headOfDepartment | superadmin
 *  Logs : Branch | FullName | Department | Login | DateTime | Ip | Location | Accuracy
 *         (Accuracy — joylashuv xatoligi, metr; ustun bo'lmasa avtomatik qo'shiladi)
 *
 * Parol oddiy matn yoki "sha256:<hex>" ko'rinishida bo'lishi mumkin
 * (hash olish uchun pastdagi hashPassword_ funksiyasini Apps Script'da ishga tushiring).
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
    } else if (req.action === "ping") {
      result = { success: true };
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

function passwordMatches_(stored, input) {
  stored = clean_(stored);
  if (stored.indexOf("sha256:") === 0) return stored.slice(7).toLowerCase() === sha256Hex_(input);
  return stored === input;
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
    return { success: true, user: user };
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
  const allowed = JSON.parse(PropertiesService.getScriptProperties().getProperty("IMPORT_TARGETS") || "{}");
  const names = (sheets || []).map(function (s) { return String(s.name); });
  if (!names.length) return { success: false, message: "Yoziladigan varaq yo'q" };
  const okList = allowed[spreadsheetId] || [];
  const denied = names.filter(function (n) { return okList.indexOf(n) === -1; });
  if (denied.length) {
    return { success: false, message: "Ruxsat etilmagan varaq(lar): " + denied.join(", ") + " (Script Properties → IMPORT_TARGETS)" };
  }

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
