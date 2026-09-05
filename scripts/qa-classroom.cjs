// Run with: pnpm dlx @playwright/cli -s=classroom run-code --filename scripts/qa-classroom.cjs
async page => {
  await page.getByRole('button', {name:'A 交代操作目的、条件、对照与判断依据',exact:true}).click();
  await page.reload();
  await page.getByRole('button', {name:'2 知识检验',exact:true}).click();
  const recovered = await page.getByRole('button', {name:'A 交代操作目的、条件、对照与判断依据',exact:true}).getAttribute('aria-pressed');
  if(recovered !== 'true') throw new Error('draft restore failed');
  for(let i=0;i<5;i++){
    await page.getByRole('button', {name:'A 交代操作目的、条件、对照与判断依据',exact:true}).click();
    await page.getByRole('button',{name:i===4?'检查答卷':'下一题',exact:true}).click();
  }
  if(await page.getByText('正确答案',{exact:true}).count()) throw new Error('answers leaked before submit');
  await page.getByRole('button',{name:'确认提交答卷',exact:true}).click();
  await page.getByRole('heading',{name:'回顾这一次思考'}).waitFor();
  const oldCard = await page.locator('.quiz-question-card').innerText();
  await page.reload();
  await page.getByRole('button',{name:'2 知识检验',exact:true}).click();
  await page.getByRole('heading',{name:'回顾这一次思考'}).waitFor();
  if(oldCard !== await page.locator('.quiz-question-card').innerText()) throw new Error('review changed after reload');
  if(!(await page.getByRole('button',{name:'下一阶段',exact:true}).isEnabled())) throw new Error('next stage locked');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/playwright/quiz-review-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/quiz-review-mobile.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow) throw new Error('mobile horizontal overflow');
  await page.getByRole('button',{name:'下一阶段',exact:true}).click();
  await page.getByRole('heading',{name:'把实验讲清楚'}).waitFor();
  return {draftRestored:true,reviewStable:true,answersHiddenBeforeSubmit:true,nextStage:true,mobileOverflow:overflow};
}
