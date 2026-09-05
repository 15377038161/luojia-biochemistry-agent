async page => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('http://localhost:3010/teacher/students?preview=1');
  await page.getByRole('button', {name: /张 张明轩/}).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({path: 'output/playwright/teacher-drawer-desktop.png'});
  await page.keyboard.press('Escape');
  if (await page.getByRole('dialog').count()) throw new Error('Escape did not close drawer');
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: /张 张明轩/}).click();
  const bounds = await page.getByRole('dialog').boundingBox();
  if (!bounds || bounds.width > 391 || bounds.width < 380) throw new Error('Mobile sheet width');
  await page.screenshot({path: 'output/playwright/teacher-drawer-mobile.png'});
  await page.getByRole('link', {name: '打开完整学习档案'}).click();
  await page.waitForURL('**/teacher/students/preview-1?preview=1');
  console.log({teacherDrawer: true, escapeCloses: true, mobileFullWidth: true, profileNavigation: true});
}
