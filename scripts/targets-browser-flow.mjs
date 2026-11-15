import assert from 'node:assert/strict';
export async function targetsBrowserFlow(page,origin){
 const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true}),target=()=>page.locator('[data-nutrient="protein"]');
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
 await page.goto(origin+'/diary');await page.locator('.calorie-summary').waitFor();await field('Diary date').fill('2026-11-14');await page.locator('.energy-ring strong').filter({hasText:'200'}).waitFor();
 await button('Settings').click();await field('Theme').selectOption('system');await page.waitForFunction(()=>!document.querySelector('[aria-label=Theme]').disabled);
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>!document.body.classList.contains('dark'));
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.body.classList.contains('dark'));
 await page.reload();await page.locator('.calorie-summary').waitFor();await field('Diary date').fill('2026-11-14');await button('Settings').click();assert.equal(await field('Theme').inputValue(),'system');
 await field('Search nutrients').fill('protein');await target().click();await field('Daily target').fill('125');await field('Maximum').fill('180');await button('Save').click();await page.locator('#sheet').waitFor({state:'hidden'});await target().filter({hasText:'125'}).waitFor();
 await target().click();assert.equal(await field('Maximum').inputValue(),'180');await button('Close').click();
 await button('Discover').click();await button('View full report').click();await field('From').fill('2026-11-14');await field('To').fill('2026-11-14');await button('Update report').click();
 const protein=page.locator('[data-report-nutrient="protein"]');await protein.filter({hasText:'Target 125 g'}).waitFor();assert.match(await protein.textContent(),/10 g/);assert.match(await page.locator('[data-report-nutrient="fat"]').textContent(),/No data/);
 await page.screenshot({path:'.local/cloud-report.png',fullPage:false});
 await field('From').fill('2026-11-15');await button('Update report').click();await page.locator('.report-content [role=status]').waitFor();await field('From').fill('2026-11-14');await button('Update report').click();await protein.filter({hasText:'Target 125 g'}).waitFor();
 await button('Settings').click();await field('Search nutrients').fill('protein');await target().click();await page.locator('[name=visible]').uncheck();await button('Save').click();await page.locator('#sheet').waitFor({state:'hidden'});await target().filter({hasText:'Hidden'}).waitFor();
 await button('Discover').click();await button('View full report').click();assert.equal(await page.locator('[data-report-nutrient="protein"]').count(),0);
 await field('Days').selectOption('complete');await button('Update report').click();await page.getByText(/^0 of \d+ days$/).waitFor();
 await button('Dashboard').click();await page.screenshot({path:'.local/cloud-dashboard.png'});
 await button('Settings').click();await field('Theme').selectOption('dark');await page.waitForFunction(()=>!document.querySelector('[aria-label=Theme]').disabled);await page.screenshot({path:'.local/cloud-targets.png'});
 let release,started;const gate=new Promise(resolve=>release=resolve),pending=new Promise(resolve=>started=resolve);const delayed=async route=>{started();await gate;await route.continue();};await page.route('**/api/nutrition-report?*',delayed);
 await button('Discover').click();await pending;await button('Diary').click();await page.locator('.calorie-summary').waitFor();const response=page.waitForResponse(r=>r.url().includes('/api/nutrition-report?'));release();await response;await page.unroute('**/api/nutrition-report?*',delayed);assert.equal(await page.locator('.nutrition-page').count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 return ['system theme follows live device changes and survives reload','target and maximum save and reopen','target reflected in source nutrition report','unknown nutrients remain unavailable','nutrient visibility reflected in report','completed-day filter','View full report navigation','tab switch ignores stale report response','no horizontal overflow or browser errors'];
}
