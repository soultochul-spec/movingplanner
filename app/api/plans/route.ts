import { NextRequest, NextResponse } from "next/server";
import { requireServerSupabase } from "../../../lib/server-supabase";

async function planForToken(token: string) {
  const db = requireServerSupabase();
  const { data, error } = await db.from("move_plans").select("*").eq("share_token", token).single();
  if (error || !data) return null;
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "초대 링크가 필요합니다." }, { status: 400 });
    const plan = await planForToken(token);
    if (!plan) return NextResponse.json({ error: "계획을 찾을 수 없습니다." }, { status: 404 });
    const db = requireServerSupabase();
    const [tasks, members] = await Promise.all([db.from("tasks").select("*").eq("plan_id", plan.id).order("relative_days"), db.from("plan_members").select("*").eq("plan_id", plan.id).order("created_at")]);
    if (tasks.error || members.error) throw tasks.error || members.error;
    return NextResponse.json({ plan, tasks: tasks.data, members: members.data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "계획을 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { plan, tasks } = await request.json();
    const db = requireServerSupabase();
    const { error: planError } = await db.from("move_plans").insert({ id: plan.id, name: plan.name, move_date: plan.moveDate, origin: plan.origin || null, destination: plan.destination || null, share_token: plan.shareToken });
    if (planError) throw planError;
    const { error: taskError } = await db.from("tasks").insert(tasks.map((task: any) => ({ id: task.id, plan_id: task.planId, title: task.title, description: task.description, category: task.category, relative_days: task.relativeDays, priority: task.priority, assignee_id: task.assigneeId || null, completed: task.completed, completed_by: task.completedBy || null, completed_at: task.completedAt || null, note: task.note || null })));
    if (taskError) throw taskError;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "계획을 만들지 못했습니다." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { token, plan } = await request.json(); const found = await planForToken(token);
    if (!found || found.id !== plan.id) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    const { error } = await requireServerSupabase().from("move_plans").update({ name: plan.name, move_date: plan.moveDate, origin: plan.origin || null, destination: plan.destination || null }).eq("id", plan.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 500 }); }
}
