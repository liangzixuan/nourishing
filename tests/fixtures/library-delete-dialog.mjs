import assert from 'node:assert/strict';

export async function checkLibraryDeleteDialog(page, triggerSelector, menuLabels) {
  const trigger = page.locator(triggerSelector);
  const original = await trigger.elementHandle();
  await trigger.click();
  assert.deepEqual(await page.locator('.ml-sheet [data-sheet-choice]').allTextContents(), menuLabels);
  await page.locator('[data-sheet-choice=delete]').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  const geometry = await dialog.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      width: rect.width,
      inset: rect.left,
      centered: Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 1,
      scrim: getComputedStyle(node, '::backdrop').backgroundColor,
    };
  });
  assert.deepEqual(geometry, {width: page.viewportSize().width - 80, inset: 40, centered: true, scrim: 'rgba(0, 0, 0, 0.6)'});
  assert.ok(await dialog.locator('[data-cancel-delete]').evaluate(button => button === document.activeElement));
  assert.ok(await original.evaluate(button => button.isConnected && button.closest('#sheet').open));
  return async () => {
    await dialog.waitFor({state: 'detached'});
    assert.ok(await original.evaluate(button => button === document.activeElement));
    await original.dispose();
  };
}
