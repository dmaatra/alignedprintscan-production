const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.APS_PLAYWRIGHT_MODULE);
const out=path.resolve(__dirname,'../output/owner-acceptance');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
 for(const width of [1440,390])for(const [name,url] of [['neighborhood','/neighborhood'],['team','/team'],['homepage','/'],['doneisha','/doneisha']]){
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());return /supabase|stripe|resend/.test(u.hostname)?r.abort():r.continue()});
  await page.goto('http://127.0.0.1:8032'+url,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{await document.fonts.ready;for(let y=0;y<document.body.scrollHeight;y+=700){scrollTo(0,y);await new Promise(r=>setTimeout(r,40))}scrollTo(0,0)});await page.waitForTimeout(300);
  const mode=width===1440?'desktop':'mobile';await page.screenshot({path:path.join(out,`${name}-${mode}.png`),fullPage:true});
  await page.locator('footer').screenshot({path:path.join(out,`footer-${name}-${mode}.png`)});
  if(name==='homepage')await page.locator('#about').screenshot({path:path.join(out,`homepage-about-${mode}.png`)});
  if(name==='neighborhood'){await page.locator('#request').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`intake-${mode}.png`),fullPage:true});await page.locator('#request').screenshot({path:path.join(out,`intake-detail-${mode}.png`)});}
  results.push({name,width,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),brokenImages:await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src')))});
  await page.close();
 }
 fs.writeFileSync(path.join(out,'public-visual-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
