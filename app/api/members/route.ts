import { NextRequest, NextResponse } from "next/server";
import { requireServerSupabase } from "../../../lib/server-supabase";

export async function POST(request: NextRequest) {
  try {
    const { token, member } = await request.json(); const db = requireServerSupabase();
    const { data: plan } = await db.from("move_plans").select("id").eq("share_token", token).eq("id", member.planId).single();
    if (!plan) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    const { data, error } = await db.from("plan_members").insert({ id: member.id, plan_id: member.planId, display_name: member.displayName, session_id: member.sessionId }).select().single();
    if (error) throw error;
    return NextResponse.json({ member: data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "사용자를 추가하지 못했습니다." }, { status: 500 }); }
}
