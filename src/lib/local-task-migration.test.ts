import test from "node:test";
import assert from "node:assert/strict";
import { localTaskMigrationContent, migratedLocalTaskId, withoutLocalMigrationDuplicates } from "./local-task-migration";
import { migrateLocalTask } from "./local-task-migration-server";
import { calendarEventDetailsFromTodoistContent as details } from "./todoist-calendar";
import type { TodoistTask, TodoistTaskPayload } from "./todoist";

const content = "Review [[unplan:v1;group=Priority%20Today;reviewAt=2026-12-01T12%3A00%3A00.000Z]]";
const input = { localId: "local-123", content, description: "Keep my notes", priority: 3, projectId: "inbox", dueDate: "2026-12-01" };
const payload: TodoistTaskPayload = { id: "remote", content: localTaskMigrationContent(content,input.localId), description: input.description, project_id: "inbox", priority: 3 };

test("migration marker preserves folder, follow-up, title, and existing metadata", () => {
  const migrated = localTaskMigrationContent(content, input.localId);
  assert.deepEqual(details(migrated), details(content));
  assert.equal(migratedLocalTaskId(migrated), input.localId);
  assert.equal(localTaskMigrationContent(migrated, input.localId), migrated);
  assert.equal(migratedLocalTaskId(localTaskMigrationContent("Plain title", "local-a/b")), "local-a/b");
});

test("first upload preserves task fields and uses stable command IDs on retry", async () => {
  const commands: Array<{uuid:string;temp_id:string;args:Record<string,unknown>}> = [];
  const provider = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (path === "/sync") {
      const command = JSON.parse((init!.body as URLSearchParams).get("commands")!)[0];
      commands.push(command);
      return { sync_status: { [command.uuid]: "ok" }, temp_id_mapping: { [command.temp_id]: "remote" } } as T;
    }
    assert.equal(path, "/tasks/remote"); return payload as T;
  };
  await migrateLocalTask(input, provider); await migrateLocalTask(input, provider);
  assert.equal(commands[0].uuid,commands[1].uuid);
  assert.equal(commands[0].temp_id,commands[1].temp_id);
  assert.equal(commands[0].args.description,input.description);
  assert.equal(commands[0].args.priority,3);
  assert.deepEqual(commands[0].args.due,{date:"2026-12-01"});
});

test("replayed upload without a mapping finds the already-created task", async () => {
  let writes = 0;
  let stored = payload;
  const saved = await migrateLocalTask(input, async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if(path === "/sync") {
      writes++;
      const command = JSON.parse((init!.body as URLSearchParams).get("commands")!)[0];
      stored = {...payload, content:command.args.content};
      return {sync_status:{[command.uuid]:"ok"},temp_id_mapping:{}} as T;
    }
    assert.equal(path,"/tasks?limit=200");return {results:[stored],next_cursor:null} as T;
  });
  assert.equal(saved.id,"remote");assert.equal(writes,1);
});

test("provider failure rejects rather than pretending a local task is synced", async () => {
  await assert.rejects(migrateLocalTask(input,async <T,>(_path:string,init?:RequestInit):Promise<T>=>{
    const command=JSON.parse((init!.body as URLSearchParams).get("commands")!)[0];
    return {sync_status:{[command.uuid]:{error:"Offline",http_code:503}}} as T;
  }),/Offline/);
});

test("a migration replay reopens a task removed during a now-undone local deletion", async () => {
  let reopened=false;
  const saved=await migrateLocalTask(input,async <T,>(path:string,init?:RequestInit):Promise<T>=>{
    if(path==="/sync") {const command=JSON.parse((init!.body as URLSearchParams).get("commands")!)[0];return {sync_status:{[command.uuid]:"ok"},temp_id_mapping:{[command.temp_id]:"remote"}} as T;}
    if(path.endsWith("/reopen")){reopened=true;return null as T;}
    return {...payload,checked:!reopened} as T;
  });
  assert.ok(reopened);assert.equal(saved.id,"remote");
});

test("an uploaded copy stays hidden while the browser task still has pending edits", () => {
  const local:TodoistTask={id:input.localId,content,description:input.description,priority:3,projectId:"local",source:"local",due:null};
  const remote:TodoistTask={...local,id:"remote",source:undefined,content:payload.content,projectId:"inbox"};
  assert.deepEqual(withoutLocalMigrationDuplicates([local,remote]).map(t=>t.id),[input.localId]);
  assert.deepEqual(withoutLocalMigrationDuplicates([remote]).map(t=>t.id),["remote"]);
});


test("retries apply a newer local edit without creating a second task", async () => {
  let updated: Record<string,unknown> | null = null;
  const changed = {...input, content: "Renamed [[unplan:v1;group=Priority%20Today]]", description:"Updated notes"};
  const saved = await migrateLocalTask(changed,async <T,>(path:string,init?:RequestInit):Promise<T>=>{
    if(path==="/sync") {const command=JSON.parse((init!.body as URLSearchParams).get("commands")!)[0];return {sync_status:{[command.uuid]:"ok"},temp_id_mapping:{[command.temp_id]:"remote"}} as T;}
    if(init?.method==="POST") {updated=JSON.parse(init.body as string);return {...payload,...updated} as T;}
    return payload as T;
  });
  assert.equal(saved.description,"Updated notes");
  assert.equal(details(saved.content).title,"Renamed");
  assert.equal(saved.id,"remote");assert.ok(updated);
});

test("a cron-refreshed upload is preserved when the local source has not changed", async () => {
  let originalContent="";
  const saved = await migrateLocalTask(input,async <T,>(path:string,init?:RequestInit):Promise<T>=>{
    if(path==="/sync") {const command=JSON.parse((init!.body as URLSearchParams).get("commands")!)[0];originalContent=command.args.content;return {sync_status:{[command.uuid]:"ok"},temp_id_mapping:{[command.temp_id]:"remote"}} as T;}
    assert.notEqual(init?.method,"POST","Must not overwrite the cron's refresh");
    return {...payload,content:originalContent.replace("group=Priority%20Today","group=Ungrouped;triageSourceGroup=Priority%20Today")} as T;
  });
  assert.equal(details(saved.content).group,"Ungrouped");
});
