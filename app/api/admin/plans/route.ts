import { NextRequest, NextResponse } from "next/server";
import { requireServerSupabase } from "../../../../lib/server-supabase";
import { isAdminPassword } from "../../../../lib/admin-auth.mjs";

function isAuthorized(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  const received = request.headers.get("x-admin-password");
  return isAdminPassword(expected, received);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "관리자 인증에 실패했습니다." }, { status: 401 });
  try {
    const { data, error } = await requireServerSupabase()
      .from("move_plans")
      .select("id,name,move_date,origin,destination,created_at,tasks(count),plan_members!plan_members_plan_id_fkey(id,display_name,created_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ plans: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "계획 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "관리자 인증에 실패했습니다." }, { status: 401 });
  try {
    const { id, scope, confirmation } = await request.json();
    const db = requireServerSupabase();
    if (scope === "all") {
      if (confirmation !== "모든 계획 삭제") return NextResponse.json({ error: "전체 삭제 확인 문구가 일치하지 않습니다." }, { status: 400 });
      const { error } = await db.from("move_plans").delete().not("id", "is", null);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (!id || confirmation !== "삭제") return NextResponse.json({ error: "삭제 요청을 확인할 수 없습니다." }, { status: 400 });
    const { error } = await db.from("move_plans").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "계획을 삭제하지 못했습니다." }, { status: 500 });
  }
}
