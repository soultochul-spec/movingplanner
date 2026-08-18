import { NextRequest, NextResponse } from "next/server";
import { requireServerSupabase } from "../../../lib/server-supabase";

async function authorized(token: string, planId: string) {
  const { data } = await requireServerSupabase().from("move_plans").select("id").eq("share_token", token).eq("id", planId).single();
  return Boolean(data);
}
const row = (task: any) => ({ id: task.id, plan_id: task.planId, title: task.title, description: task.description, category: task.category, relative_days: task.relativeDays, priority: task.priority, assignee_id: task.assigneeId || null, completed: task.completed, completed_by: task.completedBy || null, completed_at: task.completedAt || null, note: task.note || null });

export async function POST(request: NextRequest) { try { const { token, task } = await request.json(); if (!await authorized(token, task.planId)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }); const { error } = await requireServerSupabase().from("tasks").insert(row(task)); if (error) throw error; return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "추가하지 못했습니다." }, { status: 500 }); } }
export async function PATCH(request: NextRequest) { try { const { token, task } = await request.json(); if (!await authorized(token, task.planId)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }); const { error } = await requireServerSupabase().from("tasks").update(row(task)).eq("id", task.id).eq("plan_id", task.planId); if (error) throw error; return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 500 }); } }
export async function DELETE(request: NextRequest) { try { const { token, task } = await request.json(); if (!await authorized(token, task.planId)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }); const { error } = await requireServerSupabase().from("tasks").delete().eq("id", task.id).eq("plan_id", task.planId); if (error) throw error; return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "삭제하지 못했습니다." }, { status: 500 }); } }
