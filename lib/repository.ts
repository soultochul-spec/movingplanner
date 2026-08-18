"use client";

import { isCollaborationEnabled } from "./collaboration";
import { clientSupabase } from "./client-supabase";
import { buildTasks } from "./template";
import type { Member, Plan, PlanBundle, Task } from "./types";

const LOCAL_KEY = "moving-planner-bundles-v1";
const TOKENS_KEY = "moving-planner-tokens-v1";
const local = (): PlanBundle[] => JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
const persist = (value: PlanBundle[]) => localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
const remember = (token: string) => localStorage.setItem(TOKENS_KEY, JSON.stringify([...new Set([token, ...JSON.parse(localStorage.getItem(TOKENS_KEY) || "[]")])]));
const request = async (path: string, init?: RequestInit) => { const session = clientSupabase ? (await clientSupabase.auth.getSession()).data.session : null; const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...init?.headers } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다."); return data; };
const token = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);
const mapPlan = (row: any): Plan => ({ id: row.id, name: row.name, moveDate: row.move_date, origin: row.origin || "", destination: row.destination || "", shareToken: row.share_token, createdAt: row.created_at });
const mapMember = (row: any): Member => ({ id: row.id, planId: row.plan_id, displayName: row.display_name, sessionId: row.session_id });
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
    if (!isCollaborationEnabled) { persist([bundle, ...local()]); return bundle; }
    await request("/api/plans", { method: "POST", body: JSON.stringify(bundle) }); remember(plan.shareToken); return bundle;
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
  async joinPlan(planId: string, displayName: string, sessionId: string, shareToken: string) { return this.addMember(planId, displayName, shareToken, sessionId); },
  async addMember(planId: string, displayName: string, shareToken: string, sessionId = crypto.randomUUID()): Promise<Member> {
    const member = { id: crypto.randomUUID(), planId, displayName, sessionId };
    if (!isCollaborationEnabled) { persist(local().map((item) => item.plan.id === planId ? { ...item, members: [...item.members, member] } : item)); return member; }
    const data = await request("/api/members", { method: "POST", body: JSON.stringify({ token: shareToken, member }) }); return mapMember(data.member);
  },
  subscribe(_planId: string, callback: () => void) { if (!isCollaborationEnabled) return () => undefined; const interval = window.setInterval(callback, 4000); return () => window.clearInterval(interval); }
};
