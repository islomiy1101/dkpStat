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
 * VARAQLAR (1-qator — sarlavha, ustunlar tartibi muhim emas, nomi bo'yicha topiladi):
 *  Users: Branch | FullName | Department | Login | Password | Role   (Role: user / admin)
 *  Logs : Branch | FullName | Department | Login | DateTime | Ip | Location
 *
 * Parol oddiy matn yoki "sha256:<hex>" ko'rinishida bo'lishi mumkin
 * (hash olish uchun pastdagi hashPassword_ funksiyasini Apps Script'da ishga tushiring).
 */

const USERS_SHEET = "Users";
const LOGS_SHEET = "Logs";
const LOG_HEADERS = ["Branch", "FullName", "Department", "Login", "DateTime", "Ip", "Location"];
const TZ = "Asia/Tashkent";
const MAX_FAILS = 5;            // ketma-ket noto'g'ri urinishlar
const LOCK_SECONDS = 10 * 60;   // bloklash muddati

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
      result = login_(req.login, req.password, req.ip, req.location);
    } else if (req.action === "getLogs") {
      result = getLogs_(Number(req.limit) || 5000);
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

/* ---------------- login ---------------- */

function login_(login, password, ip, location) {
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
    const role = clean_(row[col("Role")]).toLowerCase() === "admin" ? "admin" : "user";
    const user = {
      login: clean_(row[cLogin]),
      fullName: clean_(row[col("FullName")]),
      branch: clean_(row[col("Branch")]),
      department: clean_(row[col("Department")]),
      role: role,
    };
    appendLog_(user, ip, location);
    return { success: true, user: user };
  }

  cache.put(failKey, String(fails + 1), LOCK_SECONDS);
  return { success: false, message: "Login yoki parol noto'g'ri!" };
}

function appendLog_(user, ip, location) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let sheet = ss_().getSheetByName(LOGS_SHEET);
    if (!sheet) {
      sheet = ss_().insertSheet(LOGS_SHEET);
      sheet.appendRow(LOG_HEADERS);
      sheet.setFrozenRows(1);
    }
    const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), LOG_HEADERS.length)).getValues()[0];
    const col = headerIndex_(header);
    const row = new Array(header.length).fill("");
    row[col("Branch")] = user.branch;
    row[col("FullName")] = user.fullName;
    row[col("Department")] = user.department;
    row[col("Login")] = user.login;
    row[col("DateTime")] = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
    row[col("Ip")] = clean_(ip) || "Noma'lum";
    row[col("Location")] = clean_(location) || "Aniqlanmadi";
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
    };
  }).reverse(); // eng yangisi birinchi

  return { success: true, logs: logs, total: lastRow - 1 };
}
