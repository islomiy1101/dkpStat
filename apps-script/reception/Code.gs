/**
 * DKP Namangan Monitoring — "Filial qabulxonasi" backend (Google Apps Script)
 * Asos: branchreceptionist/appscript.js. Login endi sayt orqali (rol: reception) — loginUser olib tashlandi.
 *
 * O'RNATISH:
 *  1. Murojaatlar / Xodimlar varaqlari bor Sheet → Extensions → Apps Script → shu faylni Code.gs ga joylang.
 *  2. Project Settings → Script Properties → "API_SECRET" (uzun tasodifiy satr).
 *     Xuddi shu qiymat Next.js .env.local dagi RECEPTION_APPS_SCRIPT_SECRET ga yoziladi.
 *  3. Deploy → Manage deployments → Edit → Version: New version (URL o'zgarmaydi).
 *     Birinchi marta: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone),
 *     .../exec URL → RECEPTION_APPS_SCRIPT_URL.
 *
 * VARAQLAR:
 *  Murojaatlar: ID | Passport | FIO | Tuman | Manzil | Keldi | Ketdi | Maqsad | QabulQildi | Lavozim | Sana | QaytaMurojaat
 *  Xodimlar   : FIO | Lavozim | Tuman
 */

// Qabulxona jadvali ID'si — FAQAT Apps Script muharririda yozing (repozitoriyda bo'sh: Netlify secrets scan)
const SPREADSHEET_ID = "";
const TZ = "GMT+5";

function getSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return {
    murojaatlar: ss.getSheetByName("Murojaatlar"),
    xodimlar: ss.getSheetByName("Xodimlar"),
  };
}

function doPost(e) {
  let result;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const secret = String(PropertiesService.getScriptProperties().getProperty("API_SECRET") || "").trim();
    if (!secret) {
      result = { success: false, message: "Forbidden: Script Properties'da API_SECRET topilmadi" };
    } else if (String(req.secret || "").trim() !== secret) {
      result = { success: false, message: "Forbidden: secret mos emas" };
    } else if (req.action === "getInitialData") {
      result = getInitialData(req.tuman);
    } else if (req.action === "searchByPassport") {
      result = searchByPassport(req.passport);
    } else if (req.action === "saveMurojaat") {
      result = saveMurojaat(req.formData || {});
    } else if (req.action === "setKetdiVaqti") {
      result = setKetdiVaqti(req.rowNum);
    } else if (req.action === "updateMurojaat") {
      result = updateMurojaat(req.rowNum, req.qabulQildi, req.lavozim);
    } else if (req.action === "ping") {
      result = { success: true };
    } else {
      result = { success: false, message: "Noma'lum amal (action)!" };
    }
  } catch (error) {
    result = { success: false, message: "Server xatoligi: " + error.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ success: false, message: "POST only" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getFormattedDate() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}

function getFormattedTime() {
  return Utilities.formatDate(new Date(), TZ, "HH:mm");
}

/**
 * Boshlang'ich ma'lumot. tuman = "boshqarma" — hamma tumanlar (Next.js server shu rejimda so'raydi
 * va tumanga o'zi filtrlaydi). Xodimlarga tuman maydoni qo'shildi.
 */
function getInitialData(tuman) {
  tuman = String(tuman || "").trim();
  const sheets = getSheets();
  const isUserBoshqarma = tuman.toLowerCase() === "boshqarma";

  const xodimlarData = sheets.xodimlar.getDataRange().getValues();
  const xodimlarList = [];
  for (let i = 1; i < xodimlarData.length; i++) {
    if (!xodimlarData[i][0]) continue;
    const xodimTuman = xodimlarData[i][2] ? xodimlarData[i][2].toString().trim() : "";
    if (isUserBoshqarma || xodimTuman.toLowerCase() === tuman.toLowerCase()) {
      xodimlarList.push({
        fio: xodimlarData[i][0].toString().trim(),
        lavozim: xodimlarData[i][1] ? xodimlarData[i][1].toString().trim() : "Mavjud emas",
        tuman: xodimTuman,
      });
    }
  }

  const murojaatData = sheets.murojaatlar.getDataRange().getValues();
  const murojaatDisplayValues = sheets.murojaatlar.getDataRange().getDisplayValues();
  const filtered = [];
  for (let i = 1; i < murojaatData.length; i++) {
    if (!murojaatData[i][0] && !murojaatData[i][1] && !murojaatData[i][2]) continue;
    const rowTuman = murojaatData[i][3] ? murojaatData[i][3].toString().trim() : "Mavjud emas";
    if (!(isUserBoshqarma || rowTuman.toLowerCase() === tuman.toLowerCase())) continue;

    let keldi = murojaatDisplayValues[i][5] ? murojaatDisplayValues[i][5].toString().trim() : "Mavjud emas";
    let ketdi = murojaatDisplayValues[i][6] ? murojaatDisplayValues[i][6].toString().trim() : "";
    const sana = murojaatDisplayValues[i][10] ? murojaatDisplayValues[i][10].toString().trim() : "Mavjud emas";
    if (keldi.length > 5 && keldi.includes(":")) keldi = keldi.substring(0, 5);
    if (ketdi.length > 5 && ketdi.includes(":")) ketdi = ketdi.substring(0, 5);

    filtered.push({
      rowNum: i + 1,
      id: murojaatData[i][0] ? murojaatData[i][0].toString().trim() : String(i),
      passport: murojaatData[i][1] ? murojaatData[i][1].toString().trim() : "Mavjud emas",
      fio: murojaatData[i][2] ? murojaatData[i][2].toString().trim() : "Mavjud emas",
      tuman: rowTuman,
      manzil: murojaatData[i][4] ? murojaatData[i][4].toString().trim() : "Mavjud emas",
      keldi: keldi,
      ketdi: ketdi,
      maqsad: murojaatData[i][7] ? murojaatData[i][7].toString().trim() : "Mavjud emas",
      qabulQildi: murojaatData[i][8] ? murojaatData[i][8].toString().trim() : "Mavjud emas",
      lavozim: murojaatData[i][9] ? murojaatData[i][9].toString().trim() : "Mavjud emas",
      sana: sana,
      qaytaMurojaat: Number(murojaatData[i][11]) || 1,
    });
  }

  filtered.sort(function (a, b) { return Number(b.id) - Number(a.id); });
  return { success: true, xodimlar: xodimlarList, murojaatlar: filtered };
}

function searchByPassport(passport) {
  passport = String(passport || "").trim().toUpperCase();
  if (!passport) return { exists: false, data: null, murojaatSoni: 0 };
  const data = getSheets().murojaatlar.getDataRange().getValues();
  let found = null;
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toString().trim().toUpperCase() === passport) {
      count++;
      if (!found) found = { fio: data[i][2], tuman: data[i][3], manzil: data[i][4] };
    }
  }
  return { exists: found !== null, data: found, murojaatSoni: count };
}

function saveMurojaat(formData) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheets().murojaatlar;
    const lastRow = sheet.getLastRow();
    const nextId = lastRow === 1 ? 1 : Number(sheet.getRange(lastRow, 1).getValue()) + 1;
    const passportCheck = searchByPassport(formData.passport);

    sheet.appendRow([
      nextId,
      (formData.passport || "Mavjud emas").toUpperCase(),
      formData.fio || "Mavjud emas",
      formData.tuman || "Mavjud emas",
      formData.manzil || "Mavjud emas",
      getFormattedTime(),
      "",
      formData.maqsad || "Mavjud emas",
      formData.qabulQildi || "Mavjud emas",
      formData.lavozim || "Mavjud emas",
      getFormattedDate(),
      passportCheck.murojaatSoni + 1,
    ]);
    return { success: true, message: "Murojaat muvaffaqiyatli saqlandi!" };
  } catch (e) {
    return { success: false, message: "Xatolik yuz berdi: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function setKetdiVaqti(rowNum) {
  const vaqt = getFormattedTime();
  getSheets().murojaatlar.getRange(Number(rowNum), 7).setValue(vaqt);
  return { success: true, vaqt: vaqt };
}

function updateMurojaat(rowNum, qabulQildi, lavozim) {
  try {
    const sheet = getSheets().murojaatlar;
    sheet.getRange(Number(rowNum), 9).setValue(qabulQildi);
    sheet.getRange(Number(rowNum), 10).setValue(lavozim);
    return { success: true, message: "Ma'lumot yangilandi!" };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
