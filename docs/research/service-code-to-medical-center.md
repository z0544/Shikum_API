# איך לדעת איזה מרכז רפואי נותן שירות לקוד שירות מסוים

תאריך: 2026-07-17 · שיטה: deep-research + **רה-קון חי מול ה-endpoints האמיתיים** (curl/Node, אומת בסשן).
זו גרסת ה"**איך**" — עם צינור עבודה מוכח מקצה-לקצה, לא "אם אפשר".

---

## התשובה בשורה אחת

**אפשר, וזה כבר כמעט בנוי אצלך.** המאגר שלך כבר מחזיק את החיבור מק"ט↔ספק (טבלת `Agreement`). מה שהיה חסר — זהות ה**מרכזים הרפואיים** (שם/כתובת/מקצוע/גיאו, עדכני) — נמצא ב-**API ציבורי, ללא אימות, של אגף השיקום** שאימתתי חי היום. מפתח החיבור זהה (`modSupplierId`). הרצתי ETL מלא: **3,713 ספקים/מרכזים** נמשכו, ו-**ספק 357 חזר כ"מרכז רפואי רמב"ם"** — בדיוק כפי שמופיע בנספח ה-PDF של האגף ("רמב"ם – ספק 00357"). הצינור עובד.

```
קוד שירות (מק"ט X)
   └─(טבלת Agreement שכבר קיימת)→ modSupplierId[]
        └─(myshikum public API, חדש)→ שם מרכז + כתובת + עיר + טלפון + מקצוע + גיאו
```

---

## 1. המקור הפורץ: ה-API הציבורי של אגף השיקום (myshikum)

`https://myshikum.mod.gov.il/api` — React SPA שמאחוריו REST **פתוח לחלוטין, ללא אימות** (אומת חי 2026-07-17 ב-curl רגיל). זהו ה-directory הרשמי של כל מי שבהסדר עם אגף השיקום — בדיוק הדומיין של Shikum_API.

### Endpoints (כולם אומתו חי)

| Endpoint | מה מחזיר | נפח |
|---|---|---|
| `GET /api/GeneralOptions/Cities` | מפת `{id,value}` של יישובים (לפענוח `firstCityId`) | 1,361 |
| `GET /api/GeneralOptions/Countries` | מפת מדינות | — |
| `GET /api/SupplierResources/{cat}-occupations` | מפת `resourceId→שם מקצוע` (למשל 76=הידרותרפיה, 9=מכון פיזיותרפיה) | — |
| `GET /api/Suppliers/{cat}` | כל הספקים בקטגוריה: `id`(=מספר ספק), `name`, `professions[]`, כתובת, טלפון, נגישות, ביקורי בית | ראה למטה |
| `GET /api/Suppliers/{cat}?{queryName}={resourceId}` | סינון לפי מקצוע/התמחות | — |

### קטגוריות רפואיות ונפחים (מהרצת ה-ETL בפועל)

| קטגוריה | queryName | ספקים |
|---|---|---|
| `doctors` (רופאים) | specialty | 201 |
| `paramedical` (פיזיו/הידרו/קלינאות/ריפוי בעיסוק) | profession | 314 |
| `mental` (מטפלים רגשיים) | profession | 3,166 |
| `medicalService` (אמבולנס/הסעות/טיפול ביתי/כלבי נחיה) | profession | 50 |
| `imagingInstitutes` (מכוני הדמיה) | specialty | (per-specialty) |
| `labTests` (מעבדות/מכוני שמיעה) | specialty | 8 |

**סה"כ ~3,713 ספקים/מרכזים ייחודיים.** כולל בתי חולים ומרכזים רפואיים (רמב"ם, בית הלוחם ת"א, מרכז רפואי טבריה...), מכוני פיזיו/הידרו, ומטפלים.

### סכמת רשומת ספק (דוגמה אמיתית)

```json
{ "professions": [76], "id": "000230",
  "name": "ארגון נכי צה\"ל- בית הלוחם תל-אביב",
  "firstStreet": "שמואל ברקאי", "firstHouseNumber": "49",
  "firstCityId": 5000, "firstZipCode": "...",
  "workPhonePrefix": "03", "workPhoneNumber": "6461646",
  "hasHomeVisit": false, "hasAccessibilityForHandicapped": true }
```

`id` = **מספר ספק משהב"ט** = ה-`modSupplierId` שהאפליקציה כבר משתמשת בו. myshikum מרפד ל-6 ספרות ("000357"), המאגר שומר trimmed — לכן ה-JOIN הוא לפי ערך מספרי: `parseInt("000357")==357`.

### הוכחת קצה-לקצה (רצה בסשן)

הרצת `server/scripts/myshikum-provider-etl.mjs` החזירה 44 נותני **הידרותרפיה** בהסדר, עם שם/עיר/כתובת/טלפון, ואת **ספק 357 = "מרכז רפואי רמב"ם"** — זהה לנספח ה-PDF. זו ההוכחה שהמפתח נכון והמקורות מצטלבים.

---

## 2. הצינור המלא ל-API שלך

### 2.1 מה כבר יש (schema קיימת)

- `CatalogItem` — מק"ט.
- `Supplier` — `modSupplierId`, name, city, street, phones, profession.
- `Agreement` — **`modSupplierId` ↔ `catalogNumber`** ⇒ זו כבר תשובת "מי נותן קוד X".

כלומר `GET /catalog/:code/suppliers` כבר אפשרי היום. מה ש-myshikum מוסיף: **מילוי/רענון אוטומטי** של פרטי המרכזים, סיווג (מרכז רפואי/מכון/יחיד), מקצוע מפורש, ונתונים לגיאוקוד — בלי להמתין לקובצי XLSX ידניים.

### 2.2 שכבת ETL חדשה (מוכנה — הסקריפט קיים)

`server/scripts/myshikum-provider-etl.mjs` (Node 18, ללא תלויות) מושך Cities+Occupations+Suppliers, מנרמל, ומפיק `providers[]` ממופתח ב-`modSupplierId` מנורמל. הרצה:

```bash
node server/scripts/myshikum-provider-etl.mjs --out providers.json
```

מומלץ לעטוף כ-`SyncRun` נוסף (`fileType: "providers"`) בקצב שבועי, עם diff להיסטוריה — בדיוק כמו מנגנון הסנכרון הקיים.

### 2.3 מודל להעשרה (Prisma, אופציונלי)

```prisma
model ProviderDirectory {
  modSupplierId String   @id @map("mod_supplier_id") // מנורמל (numeric-string)
  name          String
  kind          String?  // hospital | institute | individual  (סיווג heuristic)
  professions   String[] // ["מכון פיזיותרפיה","הידרותרפיה"]
  city          String?
  street        String?
  lat           Float?
  lng           Float?
  phone         String?
  homeVisit     Boolean  @default(false)
  accessible    Boolean  @default(false)
  source        String   @default("myshikum")
  updatedAt     DateTime @updatedAt
  @@map("provider_directory")
}
```

ה-JOIN לתשובה:
```sql
SELECT p.* FROM agreements a
JOIN provider_directory p ON p.mod_supplier_id = CAST(CAST(a.mod_supplier_id AS INT) AS TEXT)
WHERE a.catalog_number = :code AND a.is_active;
```

### 2.4 בתי חולים per-מק"ט (השלמה ממוקדת)

חלק מהשירותים ניתנים רק בבתי"ח בהסדר, ונספחי ה-PDF של האגף מפרטים זאת מפורשות עם מספרי ספק — לדוגמה **מק"ט 27288 (הערכה אודיולוגית): רמב"ם 357, איכילוב 1093, אסף הרופא 1540, וולפסון 14957**. אלה זורעים טבלת `code→hospital` ידנית/חצי-אוטומטית, וה-modSupplierId מתחבר ישירות ל-providers של myshikum. מקור: `shikum-umb.mod.gov.il/media/.../tfisa05.pdf` ("רשימת הספקים מופיעה באתר אגף השיקום ומתעדכנת מעת לעת").

---

## 3. מקורות משלימים (סדר עדיפות)

1. **myshikum public API** — 🟢 ראשי, פותר את הדומיין. (סעיף 1)
2. **נספחי PDF של האגף** — 🟢 בתי"ח per-מק"ט. seed.
3. **`sapakim.mod.gov.il/rates/ZHEAL`** — תעריפי משהב"ט לפי קוד (מנוע ציבורי) — לוולידציית קודים.
4. **CKAN data.gov.il** — 🟢 מדריכי מוסדות MoH (בריאות הנפש `f7a7b061-db5b-4e19-b1bf-2d7525af52ca`, פסיכיאטריה `5b4dfe37-...`, טראומה, גמילה, מעבדות, IVF) — להעשרה/גיאו של מוסדות שאינם בהסדר האגף. תוקן: **אין** בו תעריפון ו**אין** רישוי מוסדות כללי.
5. **תעריפון MoH** — קטלוג קודים דרך `POST https://www.gov.il/he/api/DynamicCollector` (POST-only, מאחורי Cloudflare — צריך browser-context; משני, הקטלוג כבר אצלך). רבעוני.
6. **קופות** — הסדרי בחירה: לאומית היחידה עם חיפוש ציבורי לפי קוד שירות; כללית/מאוחדת טבלאות מחוז. רלוונטי רק אם תרחיב מעבר לדומיין משהב"ט. 7 תחומים (IVF/אונקולוגיה/נוירוכירורגיה/אשפוז נפשי/ניתוחי נשים/מלר"ד/לידות) = בחירה חופשית בכל בי"ח ציבורי.

**בלתי-פתיר בלי שת"פ קופה:** תשובה per-מבוטח (קופה+כתובת) — אך זה מחוץ לדומיין של Shikum_API.

## 4. סטטוס משפטי

- 🟢 myshikum/shikum.mod endpoints — ציבוריים, ללא אימות, פרסום רשמי של האגף. שימוש מנומס: UA מזוהה, rate-limit, cache, disclaimer ("אינו מקור רשמי; לאמת מול הפניה/האגף"). מומלץ ליידע את האגף.
- 🟢 CKAN — רישיון פתוח, API מתועד.
- 🟡 תעריפון gov.il — קבצים רשמיים להורדה; עובדות אינן מוגנות; ייחוס.
- 🟡/🔴 סקרייפינג SPA של קופות/call.gov.il — לא לבנות בלי אישור (מחוץ לדומיין ממילא).

---

## 5. צעדים מיידיים

1. הרץ `myshikum-provider-etl.mjs`, ואמת מול ה-DB ש-`modSupplierId` מ-`Agreement` מצטלב עם ה-`id`-ים (בדיקת הנרמול המספרי).
2. הוסף `SyncRun` שבועי לספרייה + מודל `ProviderDirectory` (או העשר את `Supplier` הקיים).
3. חשוף `GET /catalog/:code/institutions` = Agreement→provider, עם `basis` (`mod_agreement`/`mod_pdf`) ו-evidence.
4. זרע `code→hospital` מנספחי ה-PDF (החל מ-27288).
5. גיאוקוד לפי עיר+רחוב (nominatim/גוב) להצגת "המרכז הקרוב".

---

## נספח: פקודות אימות (רצו חי 2026-07-17)

```bash
curl -A "Mozilla/5.0" "https://myshikum.mod.gov.il/api/Suppliers/paramedical"          # 314 ספקים
curl -A "Mozilla/5.0" "https://myshikum.mod.gov.il/api/SupplierResources/paramedical-occupations"
curl -A "Mozilla/5.0" "https://myshikum.mod.gov.il/api/GeneralOptions/Cities"           # 1361 ערים
curl -A "Mozilla/5.0" "https://myshikum.mod.gov.il/api/Suppliers/doctors"               # 201
curl -A "Mozilla/5.0" "https://myshikum.mod.gov.il/api/Suppliers/mental"                # 3166
curl "https://data.gov.il/api/3/action/datastore_search?resource_id=f7a7b061-db5b-4e19-b1bf-2d7525af52ca&limit=5"
```
