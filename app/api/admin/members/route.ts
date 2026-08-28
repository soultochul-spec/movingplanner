import { NextRequest, NextResponse } from "next/server";
import { isAdminPassword } from "../../../../lib/admin-auth.mjs";
import { requireServerSupabase } from "../../../../lib/server-supabase";

function isAuthorized(request: NextRequest) {
  return isAdminPassword(process.env.ADMIN_PASSWORD, request.headers.get("x-admin-password"));
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "관리자 인증에 실패했습니다." }, { status: 401 });
  try {
    const { id, confirmation } = await request.json();
    if (!id || confirmation !== "삭제") return NextResponse.json({ error: "삭제 요청을 확인할 수 없습니다." }, { status: 400 });
    const { error } = await requireServerSupabase().from("plan_members").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "참여자를 삭제하지 못했습니다." }, { status: 500 });
  }
}
