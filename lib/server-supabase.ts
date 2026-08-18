import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const serverSupabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export function requireServerSupabase() {
  if (!serverSupabase) throw new Error("서버의 Supabase 환경 변수가 설정되지 않았습니다.");
  return serverSupabase;
}
