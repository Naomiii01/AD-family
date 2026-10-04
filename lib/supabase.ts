import { createClient } from "@supabase/supabase-js";

// The publishable key is meant to be public; data is protected by row-level security in the database.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://diptjdacftuhlvpmjpyf.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ByNVe0KZIkXjqhI22SdWMQ_sTWTGxzq";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "adf-auth" },
});

export const QUICK_URL = `${SUPABASE_URL}/functions/v1/quick`;

export const MEMBER_COLS = "id,family_id,user_id,name,role,allowance,color,is_owner,archived,theme,look,extra_jars,created_at";

/** Calls a database function and returns [data, errorMessage]. */
export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<[T | null, string | null]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return [null, cleanError(error.message)];
  return [data as T, null];
}

/** Calls an edge function that answers {ok, error}. */
export async function fn<T = any>(name: string, body: Record<string, unknown>): Promise<[T | null, string | null]> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    try {
      const j = await (error as any).context?.json?.();
      if (j?.error) return [null, j.error];
    } catch {}
    return [null, "連線失敗，請檢查網路後再試一次"];
  }
  if (data && data.ok === false) return [null, data.error || data.message || "發生錯誤"];
  return [data as T, null];
}

function cleanError(m: string) {
  if (/JWT|jwt|token/.test(m)) return "登入已過期，請重新登入";
  if (/Failed to fetch|NetworkError/.test(m)) return "連線失敗，請檢查網路後再試一次";
  return m;
}
