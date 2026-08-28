"use client";

import { isCollaborationEnabled } from "./collaboration";
import { clientSupabase } from "./client-supabase";
import { buildTasks } from "./template";
import { removeLocalMember, appointLocalRepresentative } from "./member-permissions.mjs";
import type { Member, Plan, PlanBundle, Task } from "./types";

const LOCAL_KEY = "moving-planner-bundles-v1";
const TOKENS_KEY = "moving-planner-tokens-v1";
const localActor = () => {
  const id = localStorage.getItem("moving-planner-session") || crypto.randomUUID();
  localStorage.setItem("moving-planner-session", id);
  return id;
};
const local = (): PlanBundle[] => JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]").map((bundle: PlanBundle) => ({ ...bundle, plan: { ...bundle.plan, ownerId: bundle.plan.ownerId || localActor(), representativeReady: true } }));
const persist = (value: PlanBundle[]) => localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
const remember = (token: string) => localStorage.setItem(TOKENS_KEY, JSON.stringify([...new Set([token, ...JSON.parse(localStorage.getItem(TOKENS_KEY) || "[]")])]));
const request = async (path: string, init?: RequestInit) => { const session = clientSupabase ? (await clientSupabase.auth.getSession()).data.session : null; const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...init?.headers } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다."); return data; };
const token = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);
const mapPlan = (row: any): Plan => ({ id: row.id, name: row.name, moveDate: row.move_date, origin: row.origin || "", destination: row.destination || "", shareToken: row.share_token, createdAt: row.created_at, ownerId: row.owner_id, representativeId: row.representative_id, representativeReady: Object.hasOwn(row, "representative_id") });
const mapMember = (row: any): Member => ({ id: row.id, planId: row.plan_id, displayName: row.display_name, sessionId: row.session_id, userId: row.user_id });
const mapTask = (row: any): Task => ({ id: row.id, planId: row.plan_id, title: row.title, description: row.description || "", category: row.category, relativeDays: row.relative_days, priority: row.priority, assigneeId: row.assignee_id || undefined, completed: row.completed, completedBy: row.completed_by || undefined, completedAt: row.completed_at || undefined, note: row.note || "", createdAt: row.created_at });

export const repository = {
  async listPlans() {
    if (!isCollaborationEnabled) return local();
    const data = await request("/api/plans");
    return data.plans.map((bundle: any) => ({ plan: mapPlan(bundle.plan), tasks: bundle.tasks.map(mapTask), members: bundle.members.map(mapMember) }));
  },
  async getBundle(shareToken: string): Promise<PlanBundle> {
    if (!isCollaborationEnabled) { const found = local().find((item) => item.plan.shareToken === shareToken); if (!found) throw new Error("이사 계획을 찾을 수 없습니다."); return found; }
    const data = await request(`/api/plans?token=${encodeURIComponent(shareToken)}`);
    remember(shareToken);
    return { plan: mapPlan(data.plan), tasks: data.tasks.map(mapTask), members: data.members.map(mapMember) };
  },
  async createPlan(input: Pick<Plan, "name" | "moveDate" | "origin" | "destination">): Promise<PlanBundle> {
    const id = crypto.randomUUID(); const plan: Plan = { id, ...input, shareToken: token(), createdAt: new Date().toISOString() }; const bundle: PlanBundle = { plan, tasks: buildTasks(id), members: [] };
    if (!isCollaborationEnabled) { bundle.plan.ownerId = localActor(); bundle.plan.representativeReady = true; persist([bundle, ...local()]); return bundle; }
    await request("/api/plans", { method: "POST", body: JSON.stringify(bundle) }); remember(plan.shareToken); return this.getBundle(plan.shareToken);
  },
  async savePlan(plan: Plan, shareToken = plan.shareToken) {
    if (!isCollaborationEnabled) { persist(local().map((item) => item.plan.id === plan.id ? { ...item, plan } : item)); return; }
    await request("/api/plans", { method: "PATCH", body: JSON.stringify({ token: shareToken, plan }) });
  },
  async saveTask(task: Task, shareToken: string) {
    if (!isCollaborationEnabled) { persist(local().map((item) => item.plan.id === task.planId ? { ...item, tasks: item.tasks.map((old) => old.id === task.id ? task : old) } : item)); return; }
    await request("/api/tasks", { method: "PATCH", body: JSON.stringify({ token: shareToken, task }) });
  },
  async addTask(task: Task, shareToken: string) {
    if (!isCollaborationEnabled) { persist(local().map((item) => item.plan.id === task.planId ? { ...item, tasks: [...item.tasks, task] } : item)); return; }
    await request("/api/tasks", { method: "POST", body: JSON.stringify({ token: shareToken, task }) });
  },
  async deleteTask(task: Task, shareToken: string) {
    if (!isCollaborationEnabled) { persist(local().map((item) => item.plan.id === task.planId ? { ...item, tasks: item.tasks.filter((old) => old.id !== task.id) } : item)); return; }
    await request("/api/tasks", { method: "DELETE", body: JSON.stringify({ token: shareToken, task }) });
  },
  async joinPlan(planId: string, displayName: string, sessionId: string, shareToken: string): Promise<Member> {
    if (!isCollaborationEnabled) {
      const actor = localActor();
      const all = local(); const bundle = all.find((item) => item.plan.id === planId);
      if (!bundle) throw new Error("계획을 찾을 수 없습니다.");
      const member = bundle.members.find((item) => item.userId === actor) || { id: crypto.randomUUID(), planId, displayName, sessionId, userId: actor };
      if (!bundle.members.some((item) => item.id === member.id)) bundle.members.push(member);
      if (!bundle.plan.representativeId && bundle.plan.ownerId === actor) bundle.plan.representativeId = member.id;
      persist(all); return member;
    }
    const data = await request("/api/members", { method: "POST", body: JSON.stringify({ token: shareToken, action: "join", member: { displayName, sessionId } }) });
    return mapMember(data.member);
  },
  async addMember(planId: string, displayName: string, shareToken: string, sessionId = crypto.randomUUID()): Promise<Member> {
    const member = { id: crypto.randomUUID(), planId, displayName, sessionId };
    if (!isCollaborationEnabled) { persist(local().map((item) => item.plan.id === planId ? { ...item, members: [...item.members, member] } : item)); return member; }
    const data = await request("/api/members", { method: "POST", body: JSON.stringify({ token: shareToken, action: "add", member }) }); return mapMember(data.member);
  },
  async deleteMember(planId: string, memberId: string, shareToken: string) {
    if (!isCollaborationEnabled) { persist(local().map((bundle) => bundle.plan.id === planId ? removeLocalMember(bundle, memberId, localActor()) : bundle)); return; }
    await request("/api/members", { method: "DELETE", body: JSON.stringify({ token: shareToken, memberId, confirmation: "삭제" }) });
  },
  async setRepresentative(planId: string, memberId: string, shareToken: string) {
    if (!isCollaborationEnabled) { persist(local().map((bundle) => bundle.plan.id === planId ? appointLocalRepresentative(bundle, memberId, localActor()) : bundle)); return; }
    await request("/api/members", { method: "PATCH", body: JSON.stringify({ token: shareToken, memberId }) });
  },
  subscribe(_planId: string, callback: () => void) { if (!isCollaborationEnabled) return () => undefined; const interval = window.setInterval(callback, 4000); return () => window.clearInterval(interval); }
};
