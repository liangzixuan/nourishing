/** Drive the production source date picker; date selection is tentative until OK. */
export async function chooseDiaryDate(page,date){
 await page.locator('[data-md-calendar]').click();const dialog=page.locator('.mdc-dialog');await dialog.waitFor();await dialog.locator('[data-mdc-jump]').fill(date.slice(0,7));await dialog.locator('[data-mdc-date="'+date+'"]').click();
 await dialog.locator('[data-mdc-apply]').click();await dialog.waitFor({state:'detached'});await page.locator('#diary-date[data-date="'+date+'"]').waitFor();await page.locator('#page[aria-busy=false]').waitFor();
}
