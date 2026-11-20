import {CHROME_EXECUTABLE} from './_chrome.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright-core';
import {barcodeAssets} from '../scripts/package-barcode-assets.mjs';
import {createWebHandler} from '../server/http.mjs';
import {initialState, act, previewDiaryItem} from '../server/domain/workspace.mjs';
import {applyWorkspaceCommand} from '../server/workspace-commands.mjs';
import {createDataRepository} from '../server/data-repository.mjs';
import {diaryStoreFixture} from './fixtures/diary-store.mjs';
import {dashboardView} from '../server/dashboard-view.mjs';
import {chartSurfaceView} from '../server/dashboard-pinned-charts.mjs';
import {reportView, targetView} from '../server/nutrition-views.mjs';
import {displayView} from '../server/display-settings.mjs';
import {profileSettingsView} from '../server/profile-settings.mjs';
import {fastingView} from '../server/fasting.mjs';
import {repeatView} from '../server/repeat-view.mjs';
import {libraryView, libraryItem} from '../server/library-view.mjs';
import {favoriteView} from '../server/library-extras.mjs';
import {offlineSnapshot as projectOfflineSnapshot} from '../server/offline.mjs';
import {digest} from '../server/data-codec.mjs';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function createFixture() {
  const state = initialState();
  const today = todayLocal();
  state.settings.groups = ['Uncategorized', 'Breakfast', 'Lunch'];
  state.foods.push({
    id: 'oats',
    name: 'Fixture Oats',
    serving: '100 g',
    grams: 100,
    nutrients: {calories: 200, protein: 8, carbs: 34, fat: 3},
  });
  act(state, 'entry.add', {date: today, time: '08:00', group: 'Breakfast', foodId: 'oats', quantity: 100, unit: 'g'});

  const data = diaryStoreFixture(state);
  const repository = createDataRepository(data.db, 'fixture');
  const clock = {now: new Date(), timeZone: 'UTC', asOf: new Date().toISOString()};
  let apiDelayMs = 0;
  const apiHits = [];
  const staticHits = [];

  const service = {
    current: async () => ({
      id: 'fixture',
      name: 'Fixture User',
      email: 'fixture@example.com',
      emailVerified: true,
      profile: {timeZone: 'UTC', units: 'metric'},
    }),
    readDiary: async (_, day) => repository.diaryFromState(state, day, clock),
    offlineSnapshot: async () => projectOfflineSnapshot(state, {ownerId: 'fixture', generation: 'gen-1'}),
    display: async () => displayView(state),
    profileSettings: async (_, day) => profileSettingsView(state, day),
    targets: async (_, day) => targetView(state, day),
    fasting: async (_, input) => fastingView(state, clock, input),
    repeats: async (_, day) => repeatView(state, day),
    reminders: async () => ({supported: false, enabled: false, subscribed: false, schedules: []}),
    library: async () => libraryView(state),
    favorites: async () => favoriteView(state),
    libraryItem: async (_, kind, id, entryId) =>
      libraryItem(state, kind, state[kind + 's'].find(r => r.id === id), state.entries.find(r => r.id === entryId)),
    previewDiary: async (_, payload) => {
      const result = previewDiaryItem(state, payload);
      return {...result, energy: {value: result.nutrition.totals.calories, unit: 'kcal'}};
    },
    dashboard: async (_, day) => dashboardView(state, {date: day}, clock),
    charts: async (_, input) => chartSurfaceView(state, input, clock),
    nutritionReport: async (_, input) => reportView(state, input, clock),
    snapshots: async () => ({items: []}),
    catalogSearchIndex: async () => ({
      version: 1,
      generation: 'cat-1',
      datasets: [{id: 'usda-foundation', name: 'USDA Foundation'}],
      sources: [{datasetId: 'usda-foundation', dataset: 'USDA Foundation', provider: 'usda', name: 'USDA Foundation'}],
      categories: ['usda-category:09'],
      rows: [
        ['usda:apple', 'Apple, raw', '100 g', 0, 0, 0, 'fruit'],
        ['usda:banana', 'Banana, raw', '100 g', 0, 0, 0, 'fruit'],
      ],
    }),
    workspaceCommand: async (_, input) => {
      applyWorkspaceCommand(state, {type: input.type, payload: input.payload});
      return {revision: digest(state)};
    },
    analyzePhoto: async () => ({
      photo: {id: 'a'.repeat(64), dataUrl: TINY_PNG},
      reviewToken: 'fixture-token',
      suggestions: [
        {
          kind: 'observation',
          description: 'Oats',
          observationIndex: 0,
          portionEstimate: {grams: 100},
          selection: {id: 'oats', kind: 'food'},
          candidates: [{ref: {id: 'oats', kind: 'food'}, name: 'Fixture Oats', grams: 100}],
          preview: {
            version: 1,
            nutrition: previewDiaryItem(state, {date: today, time: '12:00', group: 'Lunch', foodId: 'oats', quantity: 100, unit: 'g'}).nutrition,
            energy: {value: 200, unit: 'kcal'},
          },
        },
      ],
    }),
    savePhoto: async (_, input) => {
      for (const row of input.rows ?? []) {
        act(state, 'entry.add', {
          date: input.date,
          time: input.time,
          group: input.group,
          foodId: row.foodId,
          ...(row.quantity !== undefined ? {quantity: row.quantity, unit: row.unit} : {amount: row.amount ?? 1}),
        });
      }
      return {revision: digest(state)};
    },
  };

  const vendor = new Map((await barcodeAssets()).map(a => ['/' + a.path, a]));
  const root = resolve('public');
  const assets = {
    get(path) {
      if (vendor.has(path)) return vendor.get(path);
      const file = resolve(root, '.' + (path === '/diary' ? '/diary.html' : path));
      const ext = extname(file);
      if ((file.startsWith(root + '/') || file.startsWith(root + '\\')) && existsSync(file) && ['.html', '.js', '.mjs', '.css', '.svg', '.woff2'].includes(ext)) {
        return {
          body: readFileSync(file),
          type:
            ext === '.html'
              ? 'text/html'
              : ext === '.css'
                ? 'text/css'
                : ext === '.svg'
                  ? 'image/svg+xml'
                  : ext === '.woff2'
                    ? 'font/woff2'
                    : 'text/javascript',
        };
      }
    },
  };

  let base;
  let handle;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      const chunks = [];
      if (req.method !== 'GET') {
        for await (const chunk of req) chunks.push(chunk);
      }
      if (pathname.startsWith('/api/')) {
        apiHits.push({method: req.method, path: pathname});
        if (apiDelayMs > 0) await new Promise(r => setTimeout(r, apiDelayMs));
      } else {
        staticHits.push(pathname);
      }
      if (res.destroyed) return;
      const response = await handle(
        new Request(base + req.url, {
          method: req.method,
          headers: req.headers,
          ...(req.method === 'GET' ? {} : {body: Buffer.concat(chunks)}),
        }),
      );
      if (res.destroyed) return;
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.destroyed && !res.headersSent) res.writeHead(500).end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  handle = createWebHandler({config: {origin: base}, service, assets});

  const browser = await chromium.launch({executablePath: CHROME_EXECUTABLE, headless: true});
  const context = await browser.newContext({
    viewport: {width: 412, height: 915},
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: {Cookie: '__Host-nourishing_session=fixture'},
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  return {
    page,
    base,
    today,
    errors,
    apiHits,
    staticHits,
    setApiDelay(ms) {
      apiDelayMs = ms;
    },
    close: async () => {
      await browser.close();
      server.closeAllConnections();
      await new Promise(r => server.close(r));
    },
  };
}

test('startup asset waterfall and bundle size stay within responsiveness budgets', async () => {
  const jsBundle = readFileSync(resolve('public/diary-bundle.js'));
  const cssBundle = readFileSync(resolve('public/diary-bundle.css'));
  const jsGzipBytes = gzipSync(jsBundle).byteLength;
  const cssGzipBytes = gzipSync(cssBundle).byteLength;
  assert.ok(jsGzipBytes <= 1_500_000, `diary-bundle.js gzip (${jsGzipBytes} B) exceeded 1.5 MB budget`);
  assert.ok(cssGzipBytes <= 100_000, `diary-bundle.css gzip (${cssGzipBytes} B) exceeded 100 KB budget`);

  const f = await createFixture();
  try {
    const pageJs = [];
    const pageCss = [];
    f.page.on('request', req => {
      const p = new URL(req.url()).pathname;
      if (/\.m?js$/.test(p) && p !== '/sw.js' && p !== '/offline-assets.js') pageJs.push(p);
      if (p.endsWith('.css')) pageCss.push(p);
    });
    await f.page.goto(f.base + '/diary');
    await f.page.locator('.md-diary').waitFor();
    assert.ok(pageJs.length <= 5, `Expected <= 5 startup JS requests, got ${pageJs.length}: ${pageJs.join(', ')}`);
    assert.ok(pageCss.length <= 5, `Expected <= 5 startup CSS requests, got ${pageCss.length}: ${pageCss.join(', ')}`);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test('core Diary, Photo Log, and More interactions respond instantly under 1500ms API latency', {timeout: 45000}, async () => {
  const f = await createFixture();
  try {
    const {page} = f;
    await page.goto(f.base + '/diary');
    await page.locator('.md-record').filter({hasText: 'Fixture Oats'}).waitFor();

    // Wait for background warmup (warmDeviceViews + offline snapshot sync) to populate IndexedDB.
    let warmed = false;
    for (let i = 0; i < 100 && !warmed; i++) {
      warmed = await page.evaluate(async today => {
        const store = await import('/offline-store.js');
        const copy = await store.offlineCopy();
        const cache = await import('/device-cache.js');
        const display = await cache.readDeviceCache('/api/display');
        const library = await cache.readDeviceCache('/api/library');
        const dashboard = await cache.readDeviceCache('/api/dashboard?date=' + today);
        const search = await import('/local-search.js');
        const localAll = await search.localFoodSearch(new URLSearchParams({category: 'all', sort: 'best', offset: '0', limit: '25'}));
        return Boolean(copy?.snapshot?.state && display.value && library.value && dashboard.value && localAll?.items?.length);
      }, f.today);
      if (!warmed) await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(warmed, 'Background warmup did not populate IndexedDB within 10s');

    // Enable 1500ms artificial API latency — any UI that waits on the network will fail the < 800ms budget.
    const API_DELAY_MS = 1500;
    const UI_BUDGET_MS = 800;
    f.setApiDelay(API_DELAY_MS);
    const hitsBefore = f.apiHits.length;

    const timed = async (label, fn) => {
      const hitStart = f.apiHits.length;
      const start = performance.now();
      await fn();
      const elapsed = Math.round(performance.now() - start);
      const calls = f.apiHits.slice(hitStart).map(h => `${h.method} ${h.path}`);
      assert.ok(
        elapsed < UI_BUDGET_MS,
        `${label} took ${elapsed}ms (budget < ${UI_BUDGET_MS}ms under ${API_DELAY_MS}ms API delay; API calls: ${calls.join(', ') || 'none'})`,
      );
      return elapsed;
    };

    // 1. Open Diary item: local-first open + local nutrient preview (0 blocking network calls).
    await timed('Open Diary entry + nutrients', async () => {
      await page.locator('.md-record').filter({hasText: 'Fixture Oats'}).click();
      await page.locator('[data-mf-energy]').filter({hasText: '200'}).waitFor();
    });
    const openHits = f.apiHits.slice(hitsBefore).filter(h => h.path === '/api/library/item' || h.path === '/api/diary/preview');
    assert.equal(openHits.length, 0, `Expected 0 blocking item/preview API calls, got: ${JSON.stringify(openHits)}`);

    // 2. Delete Diary entry: closes immediately and removes row from Diary without waiting for 1500ms API.
    await timed('Delete Diary entry', async () => {
      await page.locator('.mf-menu > summary').click();
      await page.getByRole('button', {name: 'Delete Entry', exact: true}).click();
      await page.locator('#sheet').waitFor({state: 'hidden'});
      await page.waitForFunction(() => document.querySelectorAll('.md-record').length === 0);
    });

    // 3. Open More -> Display right after a Diary write (scoped cache must keep Display warm!).
    await timed('Open More -> Display after Diary write', async () => {
      await page.locator('#settings-tab').click();
      await page.locator('[data-more-open="display"]').click();
      await page.locator('[data-display-open="theme"]').waitFor();
    });

    // 4. Open Foods tab from cache.
    await timed('Switch to Foods tab', async () => {
      await page.locator('#foods-tab').click();
      await page.locator('[data-action="recipe-import"]:enabled').waitFor();
    });

    // 5. Open Discover tab from cache.
    await timed('Switch to Discover tab', async () => {
      await page.locator('#discover-tab').click();
      await page.locator('.cloud-dashboard').waitFor();
    });

    // 6. Photo Log opened from Discover -> Add to Diary returns straight to Diary with new item at 0ms.
    f.setApiDelay(0); // Photo analyze is intentionally server-bound (Gemini); test Add to Diary under 1500ms delay.
    await page.locator('#add-food').click();
    await page.getByRole('button', {name: /photo/i}).first().click();
    await page.locator('[data-photo-gallery]').setInputFiles({
      name: 'meal.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG.split(',')[1], 'base64'),
    });
    await page.locator('.photo-macros').filter({hasText: '200 kcal'}).waitFor();

    f.setApiDelay(API_DELAY_MS);
    await timed('Photo Log Add to Diary returns to Diary instantly', async () => {
      await page.getByRole('button', {name: 'Add to diary', exact: true}).click();
      await page.locator('#sheet').waitFor({state: 'hidden'});
      await page.locator('.md-diary').waitFor();
      await page.locator('.md-record').filter({hasText: 'Fixture Oats'}).waitFor();
    });

    // 7. + -> Search Food (All, Common, and live typing) runs 100% locally in < 800ms with 0 /api/food-search calls.
    const searchHitsBefore = f.apiHits.length;
    await timed('Open Search Food (All)', async () => {
      await page.locator('#add-food').click();
      await page.getByRole('button', {name: /add food/i}).first().click();
      await page.locator('.mfs-result').filter({hasText: 'Apple, raw'}).waitFor();
    });
    await timed('Switch Search Food to Common tab', async () => {
      await page.locator('[data-mfs-category="common"]').click();
      await page.locator('.mfs-result').filter({hasText: 'Banana, raw'}).waitFor();
    });
    await timed('Type search query in Search Food', async () => {
      await page.locator('#food-search').fill('apple');
      await page.locator('.mfs-result').filter({hasText: 'Apple, raw'}).waitFor();
    });
    const foodSearchCalls = f.apiHits.slice(searchHitsBefore).filter(h => h.path === '/api/food-search');
    assert.equal(foodSearchCalls.length, 0, `Expected 0 /api/food-search calls, got: ${JSON.stringify(foodSearchCalls)}`);

    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});
