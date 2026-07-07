# SHIKUM_API

מערכת שליפת מק"טים, וריאנטים וספקים מורשים עבור אגף השיקום — **שכתוב מלא (Node.js + React)**
של המערכת הקיימת [`z0544/kms-api`](https://github.com/z0544/kms-api) (שנכתבה ב-Python/FastAPI).

הפרויקט מספק פריטי מוצר (מק"ט) עם וריאנטים, הסכמי מחירים, וספקים מורשים — כולל חיפוש חכם
בעברית, העשרת מחוז גיאוגרפי, דירוג ספקים לפי קרבה, ייצוא Excel, וטעינת דלתאות (Delta Sync).

## ארכיטקטורה

```
Backend  — NestJS (Controllers / Services / Repositories) + Prisma ORM + SQLite (Postgres-ready)
Frontend — React + Vite + TypeScript + Context API (RTL, עברית)
```

| שכבה | תיקייה | תיאור |
|------|--------|-------|
| Controllers | `server/src/*/**.controller.ts` | נקודות קצה HTTP |
| Services | `server/src/*/**.service.ts` | לוגיקה עסקית (חיפוש, סנכרון, גיאו, ETL, ייצוא) |
| Data Access | `server/src/catalog/catalog.repository.ts`, `prisma/` | גישה ל-DB |
| Frontend | `client/src` | ממשק משתמש |

### רכיבי ליבה
- **Variant ID מספרי** (`common/entity-id.ts`): `מק"ט-סוגזכאי-סוגסכום-רמתבסיס-רמתחריגה`, למשל `642-1-1-1-0`.
- **מנוע קונפיגורציה** (`config-map/`): מילון טקסט→INT הניתן לעריכה, עם רישום אוטומטי של ערכים חדשים.
- **Delta Sync** (`sync/`): זיהוי חדש/עודכן/נמחק (Soft-Delete) עבור 3 הקבצים, עם היסטוריית שינויים.
- **העשרה גיאוגרפית** (`geo/`): יישוב→מחוז + דירוג ספקים לפי מרחק (haversine).
- **חיפוש חכם** (`search/`): מנוע מקומי בעברית (ללא LLM) — חילוץ מילים ומיקום, דירוג רלוונטיות.

## התקנה והרצה

דרישות: **Node.js ≥ 20**.

```bash
# 1. התקנת תלויות (root + server + client)
npm run install:all

# 2. הקמת בסיס הנתונים (SQLite) — יצירת סכמה
npm run db:setup

# 3. טעינת הנתונים מקובצי ה-XLSX (server/data)
npm run etl
#   → items: 21,291 · suppliers: 463 · agreements: 25,483

# 4a. הרצה במצב פיתוח (שני תהליכים)
npm run dev:server      # http://localhost:3000  (API)
npm run dev:client      # http://localhost:5173  (Vite, proxy ל-API)

# 4b. או — build + הרצת production (שרת יחיד שמגיש גם את ה-Frontend)
npm run build
npm start                # http://localhost:3000  (API + UI יחד)
```

הגדרות ב-`server/.env` (ראה `server/.env.example`): `PORT`, `CORS_ORIGINS`, `ADMIN_TOKEN`
(אסימון ניהול — ברירת מחדל בפיתוח `shikum-admin-dev`; ריק = נקודות ניהול מושבתות), `DATABASE_URL`.

### מעבר ל-PostgreSQL
1. ב-`server/prisma/schema.prisma` שנה `provider = "postgresql"`.
2. עדכן `DATABASE_URL` ל-connection string.
3. הרץ `npm run db:setup && npm run etl`. אין שינוי בקוד היישום.

## נקודות קצה (API)

| Method | Path | תיאור |
|--------|------|-------|
| GET | `/health` | בריאות + מספר פריטים |
| GET | `/api/items?q=&match=&field=&grouped=` | חיפוש פריטים (מקובץ לפי מק"ט) |
| GET | `/api/item/:entityId` | פרטי וריאנט + ספקים + היסטוריה |
| GET | `/api/item/:entityId/history` | היסטוריית שינויים |
| GET | `/api/makt/:makt/suppliers` | ספקים מורשים למק"ט |
| GET | `/api/ai/status` | סטטוס מנוע חיפוש חכם |
| POST | `/api/ai/search` | חיפוש חכם בשפה חופשית (body: `{query}`) |
| GET | `/api/export/search` · `/api/export/makt/:makt` · `/api/export/ai/search` | ייצוא Excel |
| POST | `/api/admin/reload-data` | טעינה מחדש מלאה (🔒 X-Admin-Token) |
| POST | `/api/admin/sync/:kind/preview` · `/apply` | סנכרון דלתא (kind: items/suppliers/agreements) 🔒 |
| GET | `/api/admin/sync-runs` | היסטוריית הרצות סנכרון 🔒 |
| GET/PUT/DELETE | `/api/admin/config-map` | עריכת מילון הקונפיגורציה 🔒 |
| GET | `/items`, `/item/:id` | Legacy (תאימות לאחור) |

`field`: `all` / `מקט` / `תיאור` / `זכאי` / `ספק` / `entity_id`.
`match`: `contains` / `startswith` / `endswith` / `exact` (כולל aliases בעברית).

## בדיקות

```bash
npm test        # Jest — entity-id, geo, column-mapping
```

## מבנה הנתונים

- **catalog_items** — 12 עמודות מקובץ 53331 + `entity_id` + קודים מספריים + מטא.
- **suppliers** — 16 עמודות מקובץ 9028 + `district` (מחוז מועשר).
- **agreements** — קובץ 52593 (ספק ↔ מק"ט).
- **config_map** — מילון טקסט→INT.
- **sync_runs** / **item_history** — audit של הדלתאות.

## אריזה למסירה

```bash
tar -czvf shikum_api.tar.gz --exclude=node_modules --exclude=_source_kms \
  --exclude=.git --exclude='server/prisma/*.db' --exclude=client/dist --exclude=server/dist .
```
