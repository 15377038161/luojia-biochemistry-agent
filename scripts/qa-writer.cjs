async page => {
  await page.getByRole('button',{name:'整合与提交',exact:true}).click();
  await page.getByRole('button',{name:'确认提交实验方案',exact:true}).click();
  await page.getByText('请先用自己的话补充这个环节。',{exact:true}).waitFor();
  for(let i=0;i<5;i++) {
    await page.getByRole('textbox').fill('测试草稿环节'+(i+1)+'：说明操作目的、顺序与参数，并识别器材及判断依据。');
    if(i===0){
      await page.reload();
      await page.getByRole('button',{name:'3 推演',exact:true}).click();
      if(!(await page.getByRole('textbox').inputValue()).includes('测试草稿环节1')) throw new Error('writer draft lost');
    }
    if(i<4) await page.getByRole('button',{name:'下一环节',exact:true}).click();
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/playwright/writer-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/writer-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('writer horizontal overflow');
  await page.getByRole('button',{name:'整合实验方案',exact:true}).click();
  if(await page.getByText('测试草稿环节',{exact:false}).count()!==5) throw new Error('summary missing paragraphs');
  await page.getByRole('button',{name:'确认提交实验方案',exact:true}).click();
  await page.getByRole('heading',{name:'本步达标，继续探索'}).waitFor();
  await page.getByRole('button',{name:'五维能力',exact:true}).click();
  await page.getByRole('img',{name:'五维能力雷达图'}).waitFor();
  await page.screenshot({path:'output/playwright/step-report-mobile.png',fullPage:true});
  return {emptyBlocked:true,writerDraftRestored:true,summaryParagraphs:5,previewSubmission:true,radarVisible:true};
}
