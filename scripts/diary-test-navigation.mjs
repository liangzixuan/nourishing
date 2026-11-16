/** Drive the production source date picker; date selection is tentative until OK. */
export async function chooseDiaryDate(page,date){
 await page.locator('[data-md-calendar]').click();const dialog=page.locator('.mdc-dialog');await dialog.waitFor();await dialog.locator('[data-mdc-jump]').fill(date.slice(0,7));await dialog.locator('[data-mdc-date="'+date+'"]').click();
 await Promise.all([page.waitForResponse(response=>response.url().includes('/api/diary?date='+date)),dialog.locator('[data-mdc-apply]').click()]);await page.locator('#page[aria-busy=false]').waitFor();
}
