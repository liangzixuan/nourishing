import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {CHROME_EXECUTABLE} from './_chrome.mjs';

const origin = 'http://back-history.test';
const app = `<button id="activate">Activate app</button>
<script type="module">
  import {pushBackHandler, requestAppBack, hasAppBack} from '/back-history.js';
  window.back = {pushBackHandler, requestAppBack, hasAppBack};
  window.calls = [];
  window.layer = name => back.pushBackHandler(() => {calls.push(name)});
</script>`;

async function openApp(t) {
  const browser = await chromium.launch({executablePath: CHROME_EXECUTABLE, headless: true});
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const source = await readFile(new URL('../public/back-history.js', import.meta.url), 'utf8');
  await page.route(origin + '/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/back-history.js') return route.fulfill({contentType: 'text/javascript', body: source});
    return route.fulfill({contentType: 'text/html', body: path === '/app' ? app : '<a href="/app">Open app</a>'});
  });
  await page.goto(origin + '/previous');
  await page.getByRole('link').click();
  await page.locator('#activate').click();
  await page.waitForFunction(() => window.back);
  return page;
}

async function backLeavesApp(page) {
  await page.goBack();
  await page.waitForURL(origin + '/previous');
}

test('native Back closes one live layer, honors keep and leaves the root in one step', async t => {
  const page = await openApp(t);
  const baseLength = await page.evaluate(() => {
    history.replaceState({source: 'base'}, '');
    const length = history.length;
    layer('parent');
    const disposed = layer('buried');
    let keep = true;
    back.pushBackHandler(() => {
      calls.push(keep ? 'detail' : 'sheet');
      if (keep) {
        keep = false;
        return 'keep';
      }
    });
    disposed.release({popHistory: false});
    return length;
  });
  assert.equal(await page.evaluate(() => history.length), baseLength + 1);
  for (const expected of [['detail'], ['detail', 'sheet'], ['detail', 'sheet', 'parent']]) {
    await page.goBack();
    assert.deepEqual(await page.evaluate(() => calls), expected);
  }
  assert.deepEqual(await page.evaluate(() => history.state), {source: 'base'});
  assert.equal(await page.evaluate(() => back.requestAppBack()), false);
  await backLeavesApp(page);
});

test('rapid releases and reopens preserve the replacement during the pending browser traversal', async t => {
  const page = await openApp(t);
  const afterDrain = await page.evaluate(async () => {
    const drained = new Promise(resolve => window.addEventListener('popstate', resolve, {once: true}));
    const old = layer('old sheet');
    old.release({popHistory: false});
    old.release();
    for (let i = 0; i < 5; i++) layer('transient sheet').release();
    layer('replacement');
    await drained;
    return {calls: [...calls], active: back.hasAppBack()};
  });
  assert.deepEqual(afterDrain, {calls: [], active: true});
  await page.goBack();
  await page.waitForFunction(() => calls.length === 1);
  assert.deepEqual(await page.evaluate(() => calls), ['replacement']);
  await backLeavesApp(page);
});

test('app Back consumes the chosen layer synchronously and guards reentrant dispatch', async t => {
  const page = await openApp(t);
  const result = await page.evaluate(() => {
    const owner = layer('owner');
    back.pushBackHandler(() => {
      calls.push('editor');
      back.requestAppBack();
      layer('confirmation');
      return 'keep';
    });
    const consumed = back.requestAppBack();
    const immediate = [...calls];
    back.requestAppBack();
    owner.release({popHistory: false});
    return {consumed, immediate, afterConfirmation: [...calls], editorStillOpen: back.hasAppBack()};
  });
  assert.deepEqual(result, {consumed: true, immediate: ['editor'], afterConfirmation: ['editor', 'confirmation'], editorStillOpen: true});
  await page.goBack();
  assert.deepEqual(await page.evaluate(() => calls), ['editor', 'confirmation', 'editor']);
});

test('disposing all owners restores the root before browser Back, including after a reload', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    const first = layer('screen');
    const second = layer('sheet');
    first.release({popHistory: false});
    second.release({popHistory: false});
  });
  await page.waitForFunction(() => !history.state?.nourishingBack);
  assert.deepEqual(await page.evaluate(() => calls), []);
  await backLeavesApp(page);
  await page.getByRole('link').click();
  await page.locator('#activate').click();
  await page.evaluate(() => {layer('before reload');});
  await page.reload();
  await page.waitForFunction(() => window.back && !back.hasAppBack() && !history.state?.nourishingBack);
  await backLeavesApp(page);
});
