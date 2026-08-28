import { NextRequest, NextResponse } from "next/server";
import { requireServerSupabase } from "../../../lib/server-supabase";
import { userForRequest } from "../../../lib/server-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(request: NextRequest, operation: "POST" | "PATCH" | "DELETE") {
  try {
    const user = await userForRequest(request);
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.token !== "string" || body.token.length < 12 || body.token.length > 128) {
      return NextResponse.json({ error: "올바른 계획 링크가 필요합니다." }, { status: 400 });
    }
    const action = operation === "DELETE" ? "delete" : operation === "PATCH" ? "representative" : body.action;
    if (operation === "POST" && !["join", "add"].includes(action)) {
      return NextResponse.json({ error: "올바른 참여자 요청이 필요합니다." }, { status: 400 });
    }
    const name = typeof body.member?.displayName === "string" ? body.member.displayName.trim() : "";
    if (operation === "POST" && (name.length < 1 || name.length > 20)) {
      return NextResponse.json({ error: "이름은 1~20자로 입력해 주세요." }, { status: 400 });
    }
    if (operation !== "POST" && (typeof body.memberId !== "string" || !uuid.test(body.memberId))) {
      return NextResponse.json({ error: "참여자를 선택해 주세요." }, { status: 400 });
    }
    if (operation === "DELETE" && body.confirmation !== "삭제") {
      return NextResponse.json({ error: "삭제 확인이 필요합니다." }, { status: 400 });
    }
    const db = requireServerSupabase();
    // DB 적용 전 배포라도 기존 이름 등록 기능은 유지합니다. 대표 권한은 허용하지 않습니다.
    const { data: plan, error: planError } = await db.from("move_plans").select("*").eq("share_token", body.token).maybeSingle();
    if (planError) throw planError;
    if (!plan) return NextResponse.json({ error: "계획을 찾을 수 없습니다." }, { status: 404 });
    if (!("representative_id" in plan)) {
      if (operation !== "POST") return NextResponse.json({ error: "대표 기능의 DB 업데이트가 필요합니다." }, { status: 503 });
      const sessionId = action === "join" && typeof body.member?.sessionId === "string" ? body.member.sessionId : crypto.randomUUID();
      const { data: existing, error: existingError } = await db.from("plan_members").select("*").eq("plan_id", plan.id).eq("session_id", sessionId).maybeSingle();
      if (existingError) throw existingError;
      if (existing) return NextResponse.json({ member: existing });
      const { data, error } = await db.from("plan_members").insert({ id: crypto.randomUUID(), plan_id: plan.id, display_name: name, session_id: sessionId }).select().single();
      if (error) throw error;
      return NextResponse.json({ member: data });
    }
    const { data, error } = await db.rpc("manage_plan_member", {
      // Never accept actor/user IDs or a representative flag from the request body.
      p_actor: user.id, p_token: body.token, p_action: action,
      p_member_id: operation === "POST" ? null : body.memberId,
      p_display_name: operation === "POST" ? name : null,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: status === 500 ? "참여자 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." : error.message }, { status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "참여자 변경에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

export const POST = (request: NextRequest) => handle(request, "POST");
export const PATCH = (request: NextRequest) => handle(request, "PATCH");
export const DELETE = (request: NextRequest) => handle(request, "DELETE");
