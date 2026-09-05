async page => {
  const gaps = [];
  for (let step = 1; step <= 8; step++) {
    await page.goto('http://localhost:3010/student/step/' + step + '?preview=1&stage=0');
    await page.getByRole('button', {name: '器材与识别', exact: true}).click();
    if (await page.getByText('本步暂未配置相应器材实物图。', {exact: false}).count()) gaps.push(step);
    for (const img of await page.locator('.instrument-photo').all()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(el => el.decode());
    }
    await page.getByRole('button', {name: '操作自检', exact: true}).click();
    await page.getByRole('button', {name: '收起全部', exact: true}).click();
    if (await page.locator('.execution-grid ul').count()) throw new Error('Not collapsed together');
    await page.getByRole('button', {name: '展开全部', exact: true}).click();
    if (await page.locator('.execution-grid ul').count() !== 4) throw new Error('Not expanded together');
  }
  console.log({stepsChecked: 8, synchronizedDisclosure: true, imageGapSteps: gaps});
}
