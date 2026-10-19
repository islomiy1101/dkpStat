# DKP Namangan — yagona monitoring paneli (Next.js)

3 ta alohida HTML/CSS/JS frontend (`dkpDeadline`, `dkpPayment`, `dkpadvice`) bitta Next.js ilovasiga
birlashtirildi. Har bir bo'limning **UI/UX'i o'zgarmagan**: original CSS fayllari aynan ishlatiladi,
faqat bir-biriga ta'sir qilmasligi uchun `.sec-*` klassi ichiga scope qilingan.

| Bo'lim (sidebar) | Route | Manba |
|---|---|---|
| Rollar kesimida tahlil | `/deadline/yakunlangan`, `/deadline/jarayonda` | Google Sheets: `YakunlanganArizalar`, `JarayondagiArizalar` (jamlanma serverda hisoblanadi) |
| To'lov va tushumlar | `/payment` | Google Sheets: `TolovKutilmoqda`, `TolovReja` |
| Maslahat burchagi | `/advice` | Google Sheets + Apps Script (saqlash, chora) |
| Bazaga yuklash | `/upload` | .xlsx → Google Sheets (auth Apps Script orqali), faqat superadmin |
| Log | `/logs` | `Logs` varag'i, faqat superadmin |

## Rollar

`Users` varag'idagi `Role` ustuni. Ruxsatlar bitta joyda: `lib/roles.ts`.

| Role | Ko'rinadigan bo'limlar | Ma'lumot doirasi |
|---|---|---|
| `engineer` | To'lov va tushumlar | o'z filiali |
| `advicer` | Maslahat burchagi | o'z filiali |
| `accountant` | To'lov va tushumlar | umumiy |
| `branchManager` | Rollar kesimida tahlil, To'lov, Maslahat | o'z filiali |
| `headOfDepartment` | Rollar kesimida tahlil, To'lov, Maslahat | umumiy |
| `superadmin` | hammasi + Bazaga yuklash + Log | umumiy |

- Filtr **serverda** qo'llanadi (API boshqa filial ma'lumotini umuman qaytarmaydi), ruxsat yo'q bo'lim
  API'si 403, sahifasi esa birinchi ruxsat etilgan bo'limga yo'naltiradi.
- Filial `Users.Branch` bo'yicha aniqlanadi; "Chust tumani filiali" va "Chust tumani" bir xil hisoblanadi.
- Eski qiymatlar ham o'qiladi: `admin` → `superadmin`, `user` yoki noma'lum qiymat → `engineer`.
- "Maslahat burchagi"ning alohida logini yo'q — sayt logini bilan kiriladi. Umumiy rollar barcha
  tumanlarni ko'radi (faqat ko'rish), filial rollari o'z tumaniga murojaat kiritadi.

## Saytga kirish (login) va Log

Saytning barcha bo'limlari login bilan himoyalangan. Foydalanuvchilar va kirishlar tarixi bitta
Google Sheet'da, ikkita varaqda turadi:

| Varaq | Ustunlar (1-qator sarlavha, tartibi muhim emas) |
|---|---|
| `Users` | Branch · FullName · Department · Login · Password · Role (yuqoridagi jadvalga qarang) |
| `Logs`  | Branch · FullName · Department · Login · DateTime · Ip · Location · Accuracy |
| `UploadLogs` | DateTime · Login · FullName · Section · FileName · Sheets · Rows · Status (avtomatik yaratiladi) |

**O'rnatish:**
1. Shu sheet'da *Extensions → Apps Script* ni oching va `apps-script/auth/Code.gs` ni joylang.
2. *Project Settings → Script Properties* bo'limiga `API_SECRET` qo'shing (`openssl rand -base64 32`).
3. *Deploy → New deployment → Web app*: **Execute as: Me**, **Who has access: Anyone**. `.../exec` URL'ni oling.
4. `.env.local` ga yozing: `AUTH_APPS_SCRIPT_URL=...exec`, `AUTH_APPS_SCRIPT_SECRET=<API_SECRET bilan bir xil>`.
5. Sheet'ni "havola orqali" **ulashmang**. Unga faqat skript murojaat qiladi, parollar tashqariga chiqmaydi.

**Qanday ishlaydi:**
- Kirishda brauzer joylashuvni so'raydi; ruxsat berilmasa kirish bloklanadi va yo'riqnoma ko'rsatiladi
  (server ham tekshiradi). Kirish **istalgan joydan** mumkin — aniqlik bo'yicha cheklov yo'q.
- Joylashuv login sahifasi ochilishi bilan fonda aniqlanadi (avval tez taxminiy nuqta, keyin GPS bilan
  aniqlashtiriladi) — "Kirish" bosilganda o'sha paytgacha topilgan eng aniq nuqta olinadi, kutish deyarli yo'q.
  Kompyuterda GPS yo'q — aniqlik Wi-Fi/IP'ga bog'liq (bir necha km gacha bo'lishi mumkin).
  Brauzer koordinatasini soxtalashtirishdan to'liq himoya qilib bo'lmaydi.
- Muvaffaqiyatli kirishda `Logs` ga Branch, FullName, Department, Login, DateTime (Asia/Tashkent), Ip
  (`X-Forwarded-For`), Location (Google Maps havolasi) va Accuracy (metr) yoziladi.
  Eski `Logs` varag'iga `Accuracy` ustuni avtomatik qo'shiladi.
- Bir login uchun ketma-ket 5 marta noto'g'ri parol kiritilsa, 10 daqiqaga bloklanadi.
- Parol oddiy matn yoki `sha256:<hex>` bo'lishi mumkin (`hashPassword_` funksiyasi bilan oling).
- Sessiya: imzolangan httpOnly cookie, `AUTH_SESSION_HOURS` (default 12 soat). Muddati tugasa yoki
  cookie o'zgartirilsa, foydalanuvchi `/login` ga qaytariladi.
- Sidebar tepasida foydalanuvchining FullName, Branch, Department va roli, yonida chiqish tugmasi turadi.
- **Log** bo'limi (`/logs`) faqat `superadmin` uchun. Unda statistika kartalari, sana/filial/bo'lim filtrlari,
  qidiruv, pagination va Excel eksport bor.

Demo (`MOCK_DATA=1`) loginlari (rol bo'yicha): `admin / admin123` (superadmin), `head / head123`
(headOfDepartment), `buxgalter / bux123` (accountant), `chust / chust123` (branchManager),
`pop / pop123` (engineer), `chustmaslahat / maslahat123` (advicer).

## Bazaga yuklash (`/upload`, faqat superadmin)

Sahifa pastida **Google Sheets jadvallari** — tizim ishlatadigan barcha jadvallarga havolalar (yangi oynada
ochiladi), `lib/sheet-links.ts`. ID'lar `.env` dan olinadi va faqat shu superadmin sahifasiga uzatiladi.
Qabulxona jadvali — `RECEPTION_SHEET_ID`. Users/Logs jadvali — `AUTH_SHEET_ID`, berilmagan bo'lsa auth Apps Script'ning
`ping` javobidan (`spreadsheetId`) olinadi; topilmasa karta "Sozlanmagan" deb turadi.

Har bir bo'lim uchun alohida .xlsx fayl. Fayl avval brauzerda tekshiriladi va ko'rsatiladi (birinchi 10 qator),
tasdiqlangach server qayta tekshiradi va Google Sheets'dagi varaq(lar)ni **to'liq almashtiradi**.

| Bo'lim | .xlsx ichidagi varaq | Sheets varag'i | Tekshiruv |
|---|---|---|---|
| To'lov va tushumlar | `TolovBaza` (yoki fayldagi yagona varaq) | `TolovBaza`, A–AZ | 52 ustun; B Tuman, G Tranzaksiya raqami, P Ariza raqami, R Buyurtmachi, W Ariza manbasi, Z To'lov holati, AT Ijrochi muhandis — aynan shu harflarda (`TolovKutilmoqda` undan formulalar bilan olinadi). `TolovReja` qo'lda kiritiladi |
| Rollar kesimida tahlil | `YakunlanganArizalar` va/yoki `JarayondagiArizalar` | xuddi shu nomli varaqlar | 1–2-qator sarlavha: 1-qatorda Tuman · Tranzaksiya raqami · Ariza raqami · Ariza manbasi va rol guruhlari, 2-qatorda rollar |

To'lov: auth Apps Script'idagi `importSheets` orqali — avval har bir varaqdan yashirin `__backup` nusxa olinadi,
keyin tozalanib yoziladi; birorta varaq yozilmasa — hammasi zaxiradan tiklanadi.

Rollar kesimida tahlil: fayl katta (~100 ming qator × ~80 ustun), shuning uchun brauzer har bir varaqni 2000 qatorlik
qismlarga bo'lib yuboradi (`importChunk`), sahifada jarayon ko'rinadi. Birinchi qism varaqni tozalaydi.
Zaxira nusxa **olinmaydi** — nusxa bilan Google Sheets'ning 10 mln katak chegarasidan oshib ketadi; yuklash
o'rtada uzilsa, varaq qisman yozilgan bo'ladi va faylni qayta yuklash kerak. Kataklar matn sifatida yoziladi
(raqamga o'xshash ariza raqamlari raqamga aylanib, gviz o'qishda yo'qolmasligi uchun).
Har bir urinish `UploadLogs` ga yoziladi.

**O'rnatish (bir marta):**
1. `apps-script/auth/Code.gs` ning yangi versiyasini joylang → *Deploy → Manage deployments → Edit → New version*.
2. *Script Properties* → `IMPORT_TARGETS` (qaysi sheet'ning qaysi varaqlariga yozish mumkin):
   `{"<PAYMENT_SHEET_ID>": ["TolovBaza"], "<DEADLINE_SHEET_ID>": ["YakunlanganArizalar","JarayondagiArizalar"]}`
3. Skript egasi shu sheet'larga **Editor** bo'lishi kerak. Muharrirda istalgan funksiyani bir marta ishga
   tushirib, boshqa sheet'larni ochish ruxsatini bering.
4. `.env.local`: `DEADLINE_SHEET_ID=...` (sheet "havola orqali ko'rish" rejimida, payment kabi).

**Rollar kesimida tahlil** Django'siz: sidebar'da ikkita bo'limcha — *Yakunlangan arizalar* va *Jarayondagi arizalar*,
ko'rinishi bir xil, har biri o'z varag'idan o'qiydi. Varaqda bitta qator — bitta ariza (tranzaksiya), har bir rol
alohida ustunda, katakda rolda turgan vaqt (`1 kun 8 soat 16 min 42 s` yoki `-`). Ustunlar tartib raqami bo'yicha
emas, sarlavha nomi bo'yicha topiladi (`features/deadline/source.ts`), keyin faqat kerakli ustunlar gviz CSV orqali
olinadi. Kun — rolda turgan vaqt yuqoriga yaxlitlangan (8 soat → 1-kun, 1 kun 8 soat → 2-kun); guruhlarning
"Jami" ustunlari jadvaldagi *Filial Jami*, *BOSHQARMA/DKP JAMI KUNLAR* ga tushadi. Jamlanma
`features/deadline/aggregate.ts` da hisoblanadi va serverda `DEADLINE_CACHE_TTL_MS` (10 daqiqa) keshlanadi.

## E'tirof (`/etirof/<nomzod|tahrirlash|tolov|qaror>`)

Sidebar'dagi **E'tirof** ochiladi: *E'tirof nomzod*, *Tahrirlashga qaytarilgan*, *E'tirof to'lov kutilmoqda*,
*E'tirof qaror chiqqan*. Har biri alohida Google Sheet (`ETIROF_*_SHEET_ID`, "havola orqali ko'rish") ning
**«Свод»** varag'ini ko'rsatadi. Jadval tuzilishi (sarlavhalar, ranglar, data-bar'lar, ustun harflari)
`features/etirof/config.ts` da; sheet'dan faqat qiymatlar olinadi: A — lotincha tuman nomi (yashirin),
B — tartib raqami, C — kirillcha nom, D dan — raqamlar; C da "вилоят" — jami qatori. Sarlavhalar (1–4-qatorlar)
har bir ustun uchun kalit so'z bilan tekshiriladi — Свод'da ustun qo'shilsa/surilsa, noto'g'ri raqam o'rniga
xato chiqadi va `config.ts` dagi harflarni moslash kerak bo'ladi. "Tahrirlash" Свод'idagi yashirin
E, H, K, L, M ustunlari sahifaga chiqmaydi. Diqqat: gviz noto'g'ri varaq nomida birinchi varaqni qaytaradi.

- Tuman nomi bosilsa — xom varaqlardagi (`rawSheets`: nomzod — «Янги», «Хулосага юбориш»; tahrirlash —
  «Тахрирлашга қайтган», «Мухофаза худудда жойлашган»; to'lov va qaror — «номма-ном») shu tuman qatorlari
  `.xlsx` bo'lib yuklanadi, har bir varaq alohida (`/api/etirof/<page>/export?tuman=`); jami qatori — butun viloyat.
  Tuman "Tuman" / "Tuman nomi" ustunidan, Свод'ning A ustunidagi lotincha nom bo'yicha topiladi.
- **Rasm** — hisobot kartasi PNG (html2canvas, 3x); **Chop etish** — A4 albom, faqat hisobot, ranglar bilan.
- Kesh: `ETIROF_CACHE_TTL_MS` (5 daqiqa), "Yangilash" keshni chetlab o'tadi.

## Xatlov+Faol (`/xatlov`)

ЎРҚ-937 "ШТАБ маълумоти" jadvali — sheet `XATLOV_FAOL_SHEET_ID` (yoki `XATLOV_FAOL`), ikki varaq:
**«ШТАБ маълумоти»** (rejalar, oylik ko'rsatkichlar, Жараён, Кадастр муҳандиси) va **«Кунлик»** (Хатлов va Фаол
bloklari, har kuni yangi sana ustuni). Ustunlar `features/xatlov/config.ts` da, sarlavhalari kalit so'z bilan tekshiriladi.

- **Hafta** — dushanba–shanba (Toshkent vaqti); dushanba kuni o'tgan hafta ko'rsatiladi. Yakshanba qiymati
  ШТАБ dagidek shanbaga qo'shiladi. Kunlar «Кунлик»dan sana bo'yicha olinadi; *1 ҳафтада* = kunlar yig'indisi,
  *%* = yig'indi / ҳафталик режа.
- **Ranglar** — kunlik qiymat *1 кунлик режа*dan kam bo'lsa qizil. Foizlar: eng kichigi qizil, medianasi sariq,
  eng kattasi yashil (Excel 3 rangli shkala), 100% va undan yuqori — doim yashil.
- Rejalar sheet'da kasr son — CSV ularni yaxlitlaydi, shuning uchun aniq qiymatlar gviz JSON'dan olinadi
  (foiz va qizil rang sheet bilan bir xil chiqadi). Varaqlar `export?format=csv&gid=` orqali o'qiladi
  (gviz raqamli ustunlardagi sana sarlavhalarini yo'qotadi), gid `htmlview`dan topiladi.
- Sanalar `kun.oy.yil` formatida; Хатлов (ko'k) va Фаол (yashil) bloklari rang va qalin chegara bilan ajratilgan.
- **Rasm** (PNG) va **Chop etish** (A4 albom) — E'tirof'dagidek.

## Registratsiya (`/regtest`, `registrator` va `superadmin`)

Sidebar'da dropdown: **Test yechish** (`/regtest/test`) va **Test natijalari** (`/regtest/natijalar`).

Registratorlar bilim sinovi: F.I.O. + PINFL (14 raqam) → 20 ta tasodifiy savol (50 talik bankdan, variantlari ham har safar
aralashtiriladi) → 40 daqiqa → natija oynasi va «Натижалар» varag'iga yozuv. Ishga kirayotgan xodimning tizimga
kirish huquqi yo'q: registrator o'z login/paroli bilan kirib beradi, testni xodim PINFL bilan yechadi. Shuning uchun
registratordan faqat **login** saqlanadi, qolgani — PINFL egasiniki. «Натижалар» ustunlari: `Sana | Vaqt | Login |
PINFL | F.I.O. | Savol soni | To'g'ri | Noto'g'ri | Javobsiz | Ball | Sarflangan vaqt | Holat | Test ID`
(«F.I.O.» ustuni bo'lmasa, skript uni oxiriga qo'shadi; «FIO», «Ф.И.О.», «F.I.SH» yozilishlari ham tanildi).
F.I.O. imzolangan test tokenida saqlanadi — yakunlashda brauzerdan qayta olinmaydi.
Users varag'ida `Role = registrator` — bu rol faqat shu bo'limni ko'radi; superadmin ham ko'radi.

- Savollar sheet'i **yopiq** qoladi: «Тест саволлари» (`№ | Савол | а) | б) | в) | г) | Тўғри жавоб`, javob — variant
  matni) auth Apps Script orqali o'qiladi (`regtestQuestions`), natija `regtestSave` bilan yoziladi. Sheet ID faqat
  Apps Script muharririda — `Code.gs` → `REGTEST_SHEET_ID` (so'rovda ID yuborilmaydi).
- To'g'ri javoblar brauzerga yuborilmaydi. Tanlangan savollar, variantlar tartibi va boshlanish vaqti imzolangan
  httpOnly cookie'da (`dkp_regtest`); baholash serverda. Muddatdan 60 s kech kelgan javoblar hisobga olinmaydi.
- Har bir testning ID'si «Натижалар»ning «Test ID» ustuniga yoziladi — token qayta yuborilsa natija berilmaydi
  (javoblarni almashtirib to'g'ri javobni topishning oldi olinadi).
- Sahifa yangilansa test davom etadi (javoblar `sessionStorage`da). MOCK rejimida `mock/regtest_questions.json` va
  `mock/regtest_results.json` — o'ylab topilgan sinov ma'lumotlari (haqiqiy savollar repoga tushmaydi).
- **Bitta PINFL — 2 soatda 1 test** (boshlangan test bo'yicha: tashlab ketib qayta boshlab, yangi savollarni ko'rib
  chiqishning oldi olinadi). Boshlanganda «Натижалар»ga `Holat = Jarayonda` qatori yoziladi, yakunlanganda shu qator
  Test ID bo'yicha yangilanadi (bitta urinish — bitta qator). Muddati o'tib yakunlanmagan urinish dashboardda
  «Yakunlanmagan». Boshlanish vaqti Test ID'ning o'zida (`vaqt36-…`). Cheklov — `Code.gs → REGTEST_RETAKE_HOURS`.
- Apps Script eski versiyada bo'lsa (yangi amalni bilmasa) sayt «Noma'lum amal» o'rniga qayta deploy qilish kerakligini
  aytadi; `ping` → `regtestVersion`.
- «Натижалар»ga yozish va o'qish **sarlavha nomlari bo'yicha** (ustunlar tartibi, ortiqcha ustun muhim emas;
  yetishmagan sarlavha oxiriga qo'shiladi).
- **Test natijalari** — test yechayotgan odam registrator kompyuterida bo'lgani uchun, ochishda tizimga kirgan
  foydalanuvchi parolini qayta kiritadi (`verifyPassword` — Logs'ga yozilmaydi, 5 xatodan keyin 10 daqiqa blok).
  Ochilgach 15 daqiqa amal qiladi (imzolangan `dkp_regtest_unlock` cookie); yangi test boshlansa yoki "Qulflash"
  bosilsa — darhol qulflanadi. Dashboard: KPI'lar, ball taqsimoti, sana/holat/qidiruv filtrlari, saralanadigan
  jadval (10 tadan), Excel.

## Ishga tushirish

Netlify production konfiguratsiyasini loyiha sozlamalaridagi **Environment variables** orqali
kiriting. `.env.local` faqat lokal ishlab chiqish uchun; haqiqiy URL, sheet ID va maxfiy kalitlarni
repozitoriyga yoki `NEXT_PUBLIC_` o'zgaruvchilariga joylamang. `.env.example` faqat bo'sh maydonlar
va maxfiy bo'lmagan sozlamalarni saqlaydi.

Netlify secrets scanning yoqilgan holda qoldirildi. `netlify.toml` faqat ommaviy varaq nomlari
bo'lgan `PAYMENT_SHEET_MAIN`, `PAYMENT_SHEET_PLAN` va maxfiy bo'lmagan kesh muddatlari
`CACHE_TTL_MS`, `DEADLINE_CACHE_TTL_MS`, `ETIROF_CACHE_TTL_MS`, `XATLOV_CACHE_TTL_MS` uchun istisno belgilaydi: bu qiymatlar kodda, hujjatlarda yoki `.env.example`
faylida ham ishlatiladi. Sheet ID, Apps Script URL va maxfiy kalitlar tekshiruvdan chiqarilmagan.
Agar deploy yana bloklansa, logdagi aniqlangan fayl yo'llari va o'zgaruvchi nomlarini tekshiring;
maxfiy qiymatlarni logga chiqarmang va tekshiruvni butunlay o'chirmang. Oldin oshkor qilingan
kalitlarni almashtiring; Git tarixini tozalash alohida muvofiqlashtirilishi kerak.

```bash
cp .env.example .env.local     # ID va URL'larni to'ldiring
npm install
npm run dev                    # http://localhost:3000

# Google Sheets'siz demo (mock/*.json):
MOCK_DATA=1 npm run dev
```

Production:

```bash
npm run build && npm start
# yoki Docker:
docker build -t dkp-dashboard .
docker run -p 3000:3000 --env-file .env.local dkp-dashboard
```

## Tezlik: nima o'zgardi

1. **Parallel yuklash.** Ilova ochilishi bilan uchala bo'lim so'rovi bir vaqtda ketadi
   (`components/DataProvider.tsx`). Har bir bo'lim tayyor bo'lishi bilan ko'rsatiladi, boshqalarini kutmaydi.
   Sidebar'dagi nuqta holatni ko'rsatadi: aylanuvchi = yuklanmoqda, yashil = tayyor, qizil = xato, qulf = login kerak.
2. **Bo'lim almashtirishda qayta yuklash yo'q.** Ma'lumot xotirada turadi, sidebar orqali o'tish bir zumda.
3. **Stale-while-revalidate.** Oxirgi javob `localStorage`'da saqlanadi, keyingi safar sahifa darhol chiziladi,
   yangi ma'lumot esa fonda olinadi.
4. **Server kesh + dedupe** (`lib/cache.ts`). Google Sheets'ga bir vaqtda kelgan 50 ta foydalanuvchi so'rovi
   1 ta so'rov bo'lib boradi (`CACHE_TTL_MS`, default 30s). "Yangilash" tugmalari keshni chetlab o'tadi.
5. **Og'ir kutubxonalar faqat kerak bo'lganda yuklanadi:** xlsx, jspdf, html2canvas, exceljs tugma bosilganda
   dinamik import qilinadi. Originalda ular har safar sahifa ochilganda CDN'dan yuklanardi.

## Xavfsizlik: nima o'zgardi

- **Parollar endi brauzerga bormaydi.** Originalda `Foydalanuvchilar` varag'i (login + parol ustunlari bilan)
  gviz orqali to'liq brauzerga yuklanib, solishtirish JS'da qilinardi. Endi login `/api/advice/login`
  orqali serverda tekshiriladi.
- **Sessiya** — imzolangan httpOnly cookie. Originalda `localStorage.sessionTuman` ni qo'lda
  o'zgartirib, boshqa tumanning ma'lumotini ko'rish mumkin edi.
- **Tuman bo'yicha filtr serverda.** Filial xodimi faqat o'z tumani murojaatlarini oladi.
- Sheet ID va Apps Script URL `.env` da turadi va brauzerga chiqmaydi.

## Tuzatilgan xatolar (original koddagi)

- `cyrillicToLatin`: kichik `ч` harfi uchun kalit xato (`'ch'`) yozilgan edi, shuning uchun o'girilmasdi.
- "Viloyat yig'ma hisoboti" Excel'ida `"Чортоқ tumani"` kaliti aralash alifboda yozilgan edi, shu sabab
  Chortoq murojaatlari "Наманган шаҳар" qatoriga tushib qolardi.
- Deadline drilldown sarlavhasidagi `\vert{}` (JS'da `\v` = vertical tab) o'rniga `|` qo'yildi.
- Advice admin jadvalida ~1340px dan tor ekranda "Kelishdan Maqsad" ustuni 0 kenglikka tushib qolardi.
  Endi jadvalga minimal kenglik berilgan va kerak bo'lsa gorizontal scroll chiqadi.

## Yangi bo'lim (Google Sheet) qo'shish

1. `lib/sections.ts` — sidebar'ga yozuv qo'shing.
2. `app/api/<id>/route.ts` — sheet(lar)ni `fetchGviz` bilan `Promise.all` orqali oling, `cached()` bilan o'rang.
3. `components/DataProvider.tsx` → `FETCHERS` ga bitta funksiya qo'shing.
4. `features/<id>/View.tsx` + `app/(dashboard)/<id>/page.tsx`.
5. Agar eski CSS bo'lsa, uni `.sec-<id>` ga scope qiling (`*`, `body`, `:root` → `.sec-<id>`).

## Tuzilma

```
app/
  layout.tsx              # sidebar + DataProvider, barcha scoped CSS
  (dashboard)/{deadline,payment,advice,logs,upload}/page.tsx   # guardPage(rol)
  api/deadline/[...path]  # Sheets → summary/details/export (filial bo'yicha filtr)
  api/payment             # 2 ta sheet parallel (filial bo'yicha filtr)
  api/advice/{data,action}
  api/upload/[section]    # .xlsx → importSheets (superadmin)
  api/auth/{login,logout}, api/logs
components/{Sidebar,DataProvider}.tsx
features/{deadline,payment,advice,logs,upload,auth}/
lib/roles.ts              # rollar, ruxsatlar, branchKey
lib/{auth,auth-server,gviz,cache,session,config,advice-server,deadline-server,upload-targets,geo,mock}.ts
styles/{deadline,payment,advice,logs,upload}.css
mock/*.json                           # MOCK_DATA=1 uchun
```

## Eslatmalar

- Apps Script'dagi `doPost` o'zgarishsiz ishlaydi (`saveMurojaat`, `setKetdiVaqti`, `updateNatija`,
  `logLoginHistory`). IP endi ipify orqali emas, `x-forwarded-for` sarlavhasidan olinadi.
  Reverse proxy (nginx) shu sarlavhani uzatishi kerak.
- Gviz ishlashi uchun sheet'lar avvalgidek "havola orqali ko'rish" rejimida bo'lishi kerak. Keyingi qadam
  sifatida Service Account + Sheets API'ga o'tsangiz, sheet'larni butunlay yopiq qilish mumkin:
  faqat `lib/gviz.ts` o'zgaradi.
- HTTPS orqali ochilganda cookie avtomatik `Secure` bo'ladi, ichki tarmoqda HTTP'da ham ishlaydi.
