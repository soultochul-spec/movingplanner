import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { memberPermissions, removeLocalMember, appointLocalRepresentative } from "../lib/member-permissions.mjs";

const owner = "00000000-0000-4000-8000-000000000001";
const guest = "00000000-0000-4000-8000-000000000002";
const outsider = "00000000-0000-4000-8000-000000000003";
const planId = "00000000-0000-4000-8000-000000000010";
const token = "representative-test-token";
let db;
let ownerMember;
let guestMember;
let placeholder;

async function act(actor, action, id = null, name = null, shareToken = token) {
  const result = await db.query("select public.manage_plan_member($1::uuid, $2, $3, $4::uuid, $5) as result", [actor, shareToken, action, id, name]);
  return result.rows[0].result;
}

before(async () => {
  db = new PGlite();
  await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;");
  await db.exec(await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../supabase/representative-migration.sql", import.meta.url), "utf8");
  await db.exec(migration);
  // The migration must be safe to rerun.
  await db.exec(migration);
});
beforeEach(async () => {
  await db.exec("truncate auth.users, move_plans, plan_members, tasks cascade;");
  await db.query("insert into auth.users(id) values ($1),($2),($3)", [owner, guest, outsider]);
  await db.query("insert into move_plans(id, owner_id, name, move_date, share_token) values ($1,$2,'테스트 이사','2026-10-01',$3)", [planId, owner, token]);
  ownerMember = (await act(owner, "join", null, "대표")).member;
  guestMember = (await act(guest, "join", null, "참여자")).member;
  placeholder = (await act(owner, "add", null, "이름만 등록")).member;
});
after(async () => { await db?.close(); });

test("owner joins as representative; repeated joins keep the same membership", async () => {
  ownerMember = (await act(owner, "join", null, "대표" )).member;
  assert.equal(ownerMember.user_id, owner);
  const again = await act(owner, "join", null, "대표");
  assert.equal(again.member.id, ownerMember.id);
  assert.equal((await db.query("select representative_id from move_plans where id=$1", [planId])).rows[0].representative_id, ownerMember.id);
});

test("ordinary participants cannot appoint themselves or delete others", async () => {
  assert.equal(placeholder.user_id, null);
  await assert.rejects(act(guest, "representative", guestMember.id), { code: "42501" });
  await assert.rejects(act(guest, "delete", placeholder.id), { code: "42501" });
  await assert.rejects(act(outsider, "delete", placeholder.id), { code: "42501" });
});

test("representative cannot delete self or delegate to an unlinked name", async () => {
  await assert.rejects(act(owner, "delete", ownerMember.id), { code: "22023" });
  await assert.rejects(act(owner, "representative", placeholder.id), { code: "22023" });
});

test("a transfer immediately revokes the former representative's deletion permission", async () => {
  await act(owner, "representative", guestMember.id);
  await assert.rejects(act(owner, "delete", placeholder.id), { code: "42501" });
  const taskId = "00000000-0000-4000-8000-000000000100";
  await db.query("insert into tasks(id,plan_id,title,category,relative_days,priority,assignee_id,completed,completed_by) values ($1,$2,'예약','업체/예약',-7,'높음',$3,true,'기존 완료자')", [taskId,planId,placeholder.id]);
  await act(guest, "delete", placeholder.id);
  assert.equal((await db.query("select * from plan_members where id=$1", [placeholder.id])).rows.length, 0);
  const task = (await db.query("select * from tasks where id=$1", [taskId])).rows[0];
  assert.equal(task.assignee_id, null);
  assert.equal(task.completed, true);
  assert.equal(task.completed_by, "기존 완료자");
});

test("wrong token, cross-plan member, and anonymous actor are rejected", async () => {
  const otherPlan = "00000000-0000-4000-8000-000000000020";
  await db.query("insert into move_plans(id,owner_id,name,move_date,share_token) values ($1,$2,'다른 이사','2026-10-01','other-token')", [otherPlan, outsider]);
  const other = (await act(outsider,"join",null,"외부인","other-token")).member;
  await assert.rejects(act(guest,"delete",other.id), { code: "P0002" });
  await assert.rejects(act(guest,"representative",other.id), { code: "P0002" });
  await assert.rejects(act(guest,"delete",ownerMember.id,null,"wrong-token"), { code: "P0002" });
  await assert.rejects(act(null,"delete",ownerMember.id), { code: "42501" });
});

test("admin removal leaves no representative and only owner may appoint a replacement", async () => {
  await act(owner,"representative",guestMember.id);
  await db.query("delete from plan_members where id=$1", [guestMember.id]);
  assert.equal((await db.query("select representative_id from move_plans where id=$1", [planId])).rows[0].representative_id, null);
  await assert.rejects(act(outsider,"representative",ownerMember.id), { code: "42501" });
  await act(owner,"representative",ownerMember.id);
});

test("ownerless legacy plans cannot be claimed by a visitor", async () => {
  await db.query("update move_plans set owner_id=null, representative_id=null where id=$1", [planId]);
  await act(outsider,"join",null,"방문자");
  await assert.rejects(act(outsider,"representative",guestMember.id), { code: "42501" });
});

test("the representative reference does not prevent deleting an entire plan", async () => {
  await db.query("delete from move_plans where id=$1", [planId]);
  assert.equal((await db.query("select * from plan_members where plan_id=$1", [planId])).rows.length, 0);
});

test("local deletion preserves tasks/history and UI permissions use actor identity", () => {
  const bundle = {
    plan: { ownerId: owner, representativeId: "rep", representativeReady: true },
    members: [{ id: "rep", userId: owner }, { id: "guest", userId: guest }, { id: "unlinked" }],
    tasks: [{ id: "task", assigneeId: "guest", completed: true, completedBy: "완료자" }],
  };
  assert.equal(memberPermissions(bundle.plan, bundle.members, guest).isRepresentative, false);
  assert.equal(memberPermissions(bundle.plan, bundle.members, undefined).canAppoint, false);
  assert.throws(() => removeLocalMember(bundle,"rep",owner));
  assert.throws(() => removeLocalMember(bundle,"guest",guest));
  const updated = removeLocalMember(bundle,"guest",owner);
  assert.equal(updated.members.length,2);
  assert.deepEqual(updated.tasks[0], { id: "task", assigneeId: undefined, completed: true, completedBy: "완료자" });
  assert.equal(bundle.tasks[0].assigneeId,"guest");
  assert.throws(() => appointLocalRepresentative(bundle,"unlinked",owner));
  const transferred = appointLocalRepresentative(bundle,"guest",owner);
  assert.throws(() => removeLocalMember(transferred,"unlinked",owner));
  assert.equal(memberPermissions(transferred.plan,transferred.members,guest).isRepresentative,true);
});

test("database RPC is not executable with public client roles", async () => {
  const fn = "public.manage_plan_member(uuid,text,text,uuid,text)";
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, fn])).rows[0].allowed, false);
  }
});
