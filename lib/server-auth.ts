import { NextRequest } from "next/server";
import { requireServerSupabase } from "./server-supabase";

export async function userForRequest(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) return null;
  const { data, error } = await requireServerSupabase().auth.getUser(accessToken);
  return error ? null : data.user;
}
