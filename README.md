# DKP Namangan — yagona monitoring paneli (Next.js)

3 ta alohida HTML/CSS/JS frontend (`dkpDeadline`, `dkpPayment`, `dkpadvice`) bitta Next.js ilovasiga
birlashtirildi. Har bir bo'limning **UI/UX'i o'zgarmagan**: original CSS fayllari aynan ishlatiladi,
faqat bir-biriga ta'sir qilmasligi uchun `.sec-*` klassi ichiga scope qilingan.

| Bo'lim (sidebar) | Route | Manba |
|---|---|---|
| Rollar kesimida tahlil | `/deadline` | Django API (`/summary/`, `/details/`, `/upload/`) |
| To'lov va tushumlar | `/payment` | Google Sheets: `TolovKutilmoqda`, `TolovReja` |
| Maslahat burchagi | `/advice` | Google Sheets + Apps Script (login, saqlash, chora) |

## Saytga kirish (login) va Log

Saytning barcha bo'limlari login bilan himoyalangan. Foydalanuvchilar va kirishlar tarixi bitta
Google Sheet'da, ikkita varaqda turadi:

| Varaq | Ustunlar (1-qator sarlavha, tartibi muhim emas) |
|---|---|
| `Users` | Branch · FullName · Department · Login · Password · Role (`user` / `admin`) |
| `Logs`  | Branch · FullName · Department · Login · DateTime · Ip · Location |

**O'rnatish:**
1. Shu sheet'da *Extensions → Apps Script* ni oching va `apps-script/auth/Code.gs` ni joylang.
2. *Project Settings → Script Properties* bo'limiga `API_SECRET` qo'shing (`openssl rand -base64 32`).
3. *Deploy → New deployment → Web app*: **Execute as: Me**, **Who has access: Anyone**. `.../exec` URL'ni oling.
4. `.env.local` ga yozing: `AUTH_APPS_SCRIPT_URL=...exec`, `AUTH_APPS_SCRIPT_SECRET=<API_SECRET bilan bir xil>`.
5. Sheet'ni "havola orqali" **ulashmang**. Unga faqat skript murojaat qiladi, parollar tashqariga chiqmaydi.

**Qanday ishlaydi:**
- Kirishda brauzer joylashuvni so'raydi. Ruxsat berilmasa, kirish bloklanadi va yo'riqnoma ko'rsatiladi
  (server ham tekshiradi).
- Muvaffaqiyatli kirishda `Logs` ga Branch, FullName, Department, Login, DateTime (Asia/Tashkent), Ip
  (`X-Forwarded-For`) va Location (Google Maps havolasi) yoziladi.
- Bir login uchun ketma-ket 5 marta noto'g'ri parol kiritilsa, 10 daqiqaga bloklanadi.
- Parol oddiy matn yoki `sha256:<hex>` bo'lishi mumkin (`hashPassword_` funksiyasi bilan oling).
- Sessiya: imzolangan httpOnly cookie, `AUTH_SESSION_HOURS` (default 12 soat). Muddati tugasa yoki
  cookie o'zgartirilsa, foydalanuvchi `/login` ga qaytariladi.
- Sidebar tepasida foydalanuvchining FullName, Branch, Department va admin belgisi, yonida chiqish tugmasi turadi.
- **Log** bo'limi (`/logs`) faqat `admin` roli uchun ko'rinadi va ochiladi (API ham 403 qaytaradi).
  Unda statistika kartalari, sana/filial/bo'lim filtrlari, qidiruv, pagination va Excel eksport bor.
- "Maslahat burchagi" bo'limining o'z logini avvalgidek alohida qoladi.

Demo (`MOCK_DATA=1`) loginlari: `admin / admin123` (admin), `chust / chust123` (user).

## Ishga tushirish

Netlify production konfiguratsiyasini loyiha sozlamalaridagi **Environment variables** orqali
kiriting. `.env.local` faqat lokal ishlab chiqish uchun; haqiqiy URL, sheet ID va maxfiy kalitlarni
repozitoriyga yoki `NEXT_PUBLIC_` o'zgaruvchilariga joylamang. `.env.example` faqat bo'sh maydonlar
va maxfiy bo'lmagan sozlamalarni saqlaydi.

Netlify secrets scanning yoqilgan holda qoldirildi. `netlify.toml` faqat ommaviy varaq nomlari
bo'lgan `PAYMENT_SHEET_MAIN`, `PAYMENT_SHEET_PLAN` va maxfiy bo'lmagan kesh muddati
`CACHE_TTL_MS` uchun istisno belgilaydi: bu qiymatlar kodda, hujjatlarda yoki `.env.example`
faylida ham ishlatiladi. Sheet ID, Apps Script URL va maxfiy kalitlar tekshiruvdan chiqarilmagan.
Agar deploy yana bloklansa, logdagi aniqlangan fayl yo'llari va o'zgaruvchi nomlarini tekshiring;
maxfiy qiymatlarni logga chiqarmang va tekshiruvni butunlay o'chirmang. Oldin oshkor qilingan
kalitlarni almashtiring; Git tarixini tozalash alohida muvofiqlashtirilishi kerak.

```bash
cp .env.example .env.local     # ID va URL'larni to'ldiring
npm install
npm run dev                    # http://localhost:3000

# Google Sheets/Django'siz demo (mock/*.json):
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
- **Sessiya** — imzolangan httpOnly cookie (3 soat). Originalda `localStorage.sessionTuman` ni qo'lda
  o'zgartirib, boshqa tumanning ma'lumotini ko'rish mumkin edi.
- **Tuman bo'yicha filtr serverda.** Filial xodimi faqat o'z tumani murojaatlarini oladi.
- Sheet ID, Apps Script URL va Django/ngrok manzili `.env` da turadi va brauzerga chiqmaydi.

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
  (dashboard)/{deadline,payment,advice}/page.tsx
  api/deadline/[...path]  # Django proxy (summary keshlanadi)
  api/payment             # 2 ta sheet parallel
  api/advice/{login,logout,me,data,action}
components/{Sidebar,DataProvider}.tsx
features/{deadline,payment,advice}/   # React'ga ko'chirilgan mantiq
lib/{gviz,cache,session,config,advice-server,mock}.ts
styles/{deadline,payment,advice}.css  # original CSS, scope qilingan
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
