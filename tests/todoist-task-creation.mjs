// All providers are mocked; each case uses its own browser context.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const legacy = {id:'local-old-fixture',content:'Legacy task [[unplan:v1;group=Priority%20Tomorrow;reviewAt=2026-01-01T00%3A00%3A00.000Z]]',description:'Preserve notes',source:'local',priority:2,projectId:'__unplan_local__',due:null};
const expired = {id:'remote-expired',content:'Expired remote task [[unplan:v1;group=Priority%20Tomorrow;groupChangedAt=2026-01-01T00%3A00%3A00.000Z;reviewAt=2026-01-02T00%3A00%3A00.000Z]]',description:'',priority:1,project_id:'project'};
const wait = async (fn) => {for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Condition not met');};
async function setup({locals=[],connected=true,failCreate=false,failMigration=false}={}) {
 const context=await browser.newContext();
 await context.addInitScript(({locals,connected})=>{
  if(localStorage.getItem('creation-fixture-ready'))return;
  localStorage.setItem('creation-fixture-ready','true');
  if(connected)localStorage.setItem('todoist_api_key','mock');
  localStorage.setItem('todoist_project_id','project');
  localStorage.setItem('unplan:local-tasks:v1',JSON.stringify(locals));
  localStorage.setItem('unplan_undo_toast_duration','5000');
 },{locals,connected});
 const state={tasks:[expired],creates:[],updates:[],migrations:[],failMigration};
 await context.route('**/api/**',async route=>{
  const req=route.request(), path=new URL(req.url()).pathname;
  if(path==='/api/google/accounts')return route.fulfill({json:{accounts:[]}});
  if(path==='/api/task-refresh/settings')return route.fulfill({json:{serverConfigured:false,serverManaged:false,settings:null}});
  if(path==='/api/todoist/destinations')return route.fulfill({json:{projects:[{id:'project',name:'Inbox',inbox_project:true}],sections:[]}});
  if(path==='/api/todoist/local-tasks'){
   const input=req.postDataJSON();state.migrations.push(input);
   if(state.failMigration)return route.fulfill({status:503,json:{error:'Migration temporarily unavailable'}});
   const content=input.content.replace(']]',`;migratedFromLocal=${encodeURIComponent(input.localId)}]]`);
   const saved={id:'migrated-task',content,description:input.description,priority:input.priority,project_id:'project'};
   state.tasks=state.tasks.filter(t=>t.id!==saved.id).concat(saved);
   return route.fulfill({json:{task:saved}});
  }
  if(path==='/api/todoist/tasks'){
   if(req.method()==='GET')return route.fulfill({json:{tasks:state.tasks}});
   const input=req.postDataJSON();
   if(input.action==='create'){
    state.creates.push(input);
    if(failCreate)return route.fulfill({status:503,json:{error:'Fake create failure'}});
    const saved={id:'created-'+state.creates.length,content:input.content,description:input.description??'',project_id:input.projectId,priority:1};state.tasks.push(saved);
    return route.fulfill({json:{task:saved}});
   }
   state.updates.push(input);
   const saved={id:input.taskId,content:input.content,description:input.description??'',project_id:'project',priority:1};
   state.tasks=state.tasks.map(t=>t.id===saved.id?saved:t);
   return route.fulfill({json:{task:saved,ok:true}});
  }
  return route.fulfill({json:{}});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.UNPLAN_TEST_URL||'http://localhost:3004');
 await page.getByRole('button',{name:'Add task',exact:true}).waitFor();
 return {context,page,state,errors};
}
async function add(page,title){await page.getByRole('button',{name:'Add task',exact:true}).click();await page.getByRole('textbox',{name:'Task name',exact:true}).fill(title);await page.getByRole('textbox',{name:'Task name',exact:true}).press('Enter');}
try {
 {
  const {context,page,state,errors}=await setup();
  await page.waitForTimeout(1200);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(300);
  assert.equal(state.updates.length,0,'Expired remote tasks must not be changed by the browser, even without serverManaged');
  await add(page,'Undo this new task');await page.keyboard.press('Meta+z');
  await page.waitForTimeout(300);assert.equal(state.creates.length,0);
  assert.equal(await page.getByText('Undo this new task',{exact:true}).count(),0);
  await add(page,'Save this new task');await page.keyboard.press('Meta+Enter');
  await wait(()=>state.creates.length===1);
  assert.ok(state.creates[0].content.startsWith('Save this new task'));
  assert.equal(state.creates[0].projectId,'project');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('unplan:local-tasks:v1')||'[]')),[]);
  await page.reload();await page.waitForTimeout(700);
  assert.equal(state.creates.length,1,'Reload must not create the task again');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: Todoist creation, Undo, reload persistence, and no client-side expiration');
 }
 {
  const {context,page,state}=await setup({failCreate:true});await add(page,'Rejected save');await page.keyboard.press('Meta+Enter');
  await page.getByText('Fake create failure',{exact:true}).waitFor();
  assert.equal(state.creates.length,1);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('unplan:local-tasks:v1')||'[]')),[]);
  await context.close();console.log('PASS: failed creation surfaces the error without a browser-only fallback');
 }
 {
  const {context,page,state,errors}=await setup({locals:[legacy],failMigration:true});
  await wait(()=>state.migrations.length>0);
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('unplan:local-tasks:v1'))))[0].id,legacy.id);
  state.failMigration=false;
  await page.clock.install();await page.clock.fastForward(31000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await wait(async()=> (await page.evaluate(()=>JSON.parse(localStorage.getItem('unplan:local-tasks:v1')||'[]'))).length===0);
  assert.equal(state.tasks.filter(t=>t.id==='migrated-task').length,1);
  assert.equal(state.tasks.find(t=>t.id==='migrated-task').description,'Preserve notes');
  assert.ok(state.tasks.find(t=>t.id==='migrated-task').content.includes('reviewAt=2026-01-01'));
  assert.equal(state.updates.length,0,'Migrating an overdue task must not refresh it in the browser');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: legacy tasks survive upload failure, retry, and migrate without losing notes or follow-up dates');
 }
 {
  const {context,page,state}=await setup({connected:false});
  assert.ok(await page.getByRole('button',{name:'Add task',exact:true}).isDisabled());
  assert.equal(state.creates.length,0);await context.close();console.log('PASS: adding tasks requires Todoist');
 }
} finally {await browser.close();}
