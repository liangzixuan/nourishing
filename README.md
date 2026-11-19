# Nourishing

Nourishing is an installable nutrition and health-tracking PWA hosted at [nourishing.app](https://nourishing.app) on Appwrite Cloud, with public registration and private per-account data.

## Features

- **Diary & Logging**: Daily food, exercise, biometric, and note entries (with note photos), selection tools, copy/paste, reusable meals, entry ordering, and offline editing via account-partitioned IndexedDB.
- **Foods Library**: Custom foods, recipes, meals, named portions, favorites, retirement/restoration, occurrence-only diary ingredient adjustments, barcode scanning & branded lookup (Open Food Facts), recipe URL import, Gemini photo logging, and text logging.
- **Discover & Analytics**: Dashboard, custom & pinned charts, nutrition reports with printable/PDF preview, progress snapshots, streaks, fasting schedules, glucose/CGM timeline, cycle tracking, Coach, food suggestions, and nutrient search.
- **Targets & Settings**: Nutrient targets, macro/energy policies, weekday schedules, day overrides, profile & body settings, multi-language UI (English, French, German, Brazilian Portuguese), and dark/light/device themes.
- **Notifications, Backups & Account Lifecycle**: Web Push reminders (VAPID) and scheduled fasting via private Appwrite Functions, full portable JSON + photo backup/restore with previous-version recovery, and resumable account deletion.

## Architecture

- **Runtime**: Astro SSR (`@astrojs/node` standalone adapter) with a single catch-all entrypoint (`src/pages/[...path].js`) backed by `server/http.mjs` and `server/appwrite-service.mjs`.
- **Storage & Auth**: Appwrite Auth, TablesDB (transactional writes with optimistic concurrency and idempotent `command_receipts`), Storage (`private-media`), Sites, and Functions.
- **Offline**: Service worker (`public/sw.js`) caches public assets only; private data stays in IndexedDB and is cleared on logout. See [docs/offline-parity.md](docs/offline-parity.md), [docs/device-caching.md](docs/device-caching.md), and [docs/account-lifecycle.md](docs/account-lifecycle.md).
- **Integration**: AppWrite, Codecov, CodeScene, Sentry.

## Running Locally

Requires **Node.js >= 22.23.4** and the environment variables in `.env.example`.

```sh
npm ci
npm run build
npm start
```

Production requires HTTPS. Appwrite Sites supplies a scoped ephemeral request key; private data requests execute under the signed-in user's session.

## Testing

```sh
npm test
```

For live Appwrite integration checks (using disposable test accounts that are cleaned up automatically):

```sh
node scripts/verify-appwrite.mjs
```

`verify-appwrite.mjs` requires a short-lived operator key in `.local/integration-key.json` (git-ignored).
