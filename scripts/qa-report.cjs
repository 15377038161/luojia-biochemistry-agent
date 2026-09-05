async page => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({width, height: 900});
    await page.goto('http://localhost:3010/student/report?preview=1');
    await page.getByRole('img', {name: '五维能力得分雷达图'}).waitFor();
    for (const title of ['八步记录', 'AI 分析', '改进与资料', '能力总览']) {
      await page.getByRole('button', {name: title, exact: true}).click();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Overflow at ' + width + ' ' + title);
    }
    await page.screenshot({path: 'output/playwright/report-' + width + '.png', fullPage: true});
  }
  await page.goto('http://localhost:3010/teacher/reviews?preview=1');
  await page.getByRole('button', {name: /张明轩.*待复核/}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('textbox', {name: '教师复核结论'}).fill('演示回归测试：依据完整作答证据确认原成绩。');
  await page.getByRole('button', {name: '确认原成绩', exact: true}).click();
  await page.getByText('复核结果已记录。', {exact: true}).waitFor();
  console.log({reportWidths: [390, 768, 1440], reportTabs: true, reviewSheet: true, previewReview: true});
}
