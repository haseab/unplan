// Provider traffic and linked pages are mocked; no real tasks are changed.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, ...(process.env.UNPLAN_TEST_BROWSER === 'brave' ? { executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' } : { channel: 'chrome' }) });
try {
 for (const mode of ['legacy', 'markdown', 'bare', 'unsafe']) {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
   const nativeOpen = window.open;
   window.__transcriptWindowCalls = [];
   window.open = function (...args) {
    window.__transcriptWindowCalls.push(args);
    return nativeOpen.apply(window, args);
   };
   localStorage.setItem('todoist_api_key', 'description-link-test');
   localStorage.setItem('todoist_project_id', 'inbox');
   localStorage.setItem('unplan:google-accounts:v1', JSON.stringify([{id:'links-test',email:'links@example.test',accessToken:'mock',expiresAt:Date.now()+3600000}]));
  });
  const description = mode === 'legacy' ? 'Recording source-id at 2026-10-28T17:46:21Z [DeepLog:tracking-id]'
   : mode === 'markdown' ? 'Read [Source evidence](https://example.test/source)'
   : mode === 'bare' ? 'Read https://example.test/source'
   : 'Read [Unsafe](javascript:alert(1))';
  let mutations=0;
  await context.route('https://deeplog.app/**',route=>route.fulfill({contentType:'text/html',body:'Source recording'}));
  await context.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'Source evidence'}));
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/google/calendars')return route.fulfill({json:{calendars:[{id:'google|links-test|primary',accountId:'links-test',name:'Test',backgroundColor:'#4666e5',foregroundColor:'#fff',selected:true,writable:true,provider:'google',providerCalendarId:'primary'}]}});
   if(url.pathname==='/api/google/events')return route.fulfill({json:{events:[],errors:[]}});
   if(url.pathname==='/api/todoist/destinations')return route.fulfill({json:{projects:[{id:'inbox',name:'Inbox',inbox_project:true},{id:'extraction',name:'task-extraction'}],sections:[]}});
   if(url.pathname==='/api/todoist/tasks'){
    if(route.request().method()!=='GET'){mutations++;return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{tasks:url.searchParams.get('projectId')==='extraction'?[{id:'extracted-test',content:'Review source evidence',description,project_id:'extraction'}]:[]}});
   }
   return route.fulfill({json:{}});
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.UNPLAN_TEST_URL || 'http://localhost:3004');
  await page.getByRole('button',{name:'Extracted triage, 1 remaining',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Extracted triage',exact:true});
  await dialog.waitFor();
  if(mode==='unsafe')assert.equal(await dialog.locator('p a').count(),0);
  else{
   const label=mode==='legacy'?'View transcript':mode==='markdown'?'Source evidence':'https://example.test/source';
   const link=dialog.getByRole('link',{name:label,exact:true});
   await link.waitFor();
   const href=await link.getAttribute('href');
   if(mode==='legacy'){
    assert.equal(new URL(href).searchParams.get('q'),'2026-10-28T17:46:21.000Z to 2026-10-28T17:47:21.000Z');
    assert.equal(await dialog.locator('.task-triage-extracted-footer > p').innerText(),'View transcript');
   }
   const popupPromise=page.waitForEvent('popup');await link.click();const popup=await popupPromise;await popup.waitForURL(href);assert.equal(await popup.evaluate(() => window.opener),null);await popup.close();
   await dialog.waitFor();
   // Keyboard activation opens the link rather than resolving the review card.
   const keyboardPopup=page.waitForEvent('popup');await link.focus();await page.keyboard.press('Enter');const second=await keyboardPopup;await second.waitForURL(href);assert.equal(await second.evaluate(() => window.opener),null);await second.close();
   assert.deepEqual(await page.evaluate(() => window.__transcriptWindowCalls),[['about:blank','_blank'],['about:blank','_blank']]);
   if(mode==='legacy')await page.screenshot({path:'/private/tmp/unplan-extracted-description-link.png'});
  }
  assert.equal(mutations,0,'Opening descriptions must not keep/delete/update tasks');
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: legacy recording references, Markdown links, bare URLs, unsafe URLs, and mouse/keyboard opening without task mutations');
} finally { await browser.close(); }
