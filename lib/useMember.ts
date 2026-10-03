"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, rpc } from "@/lib/supabase";

export type MemberData = {
  loaded: boolean;
  bal: { free: number; dream: number; long: number; dream_own?: number; dream_tiers?: number; last_expense: string | null };
  months: any[];
  goal: any | null;
  achieved: any[];
  recent: any[];
  reload: () => Promise<void>;
};

const EMPTY = { free: 0, dream: 0, long: 0, last_expense: null };

export function useMember(memberId: string | undefined): MemberData {
  const [d, setD] = useState<Omit<MemberData, "reload">>({ loaded: false, bal: EMPTY, months: [], goal: null, achieved: [], recent: [] });
  const load = useCallback(async () => {
    if (!memberId) return;
    const [[bal], mo, g, l] = await Promise.all([
      rpc("balances", { p_member: memberId }),
      supabase.from("months").select("*").eq("member_id", memberId).order("month"),
      supabase.from("goals").select("*").eq("member_id", memberId).order("created_at", { ascending: false }),
      supabase.from("ledger").select("id,jar,amount,note,month,kind,created_at").eq("member_id", memberId)
        .order("created_at", { ascending: false }).limit(12),
    ]);
    const goals = g.data || [];
    setD({
      loaded: true,
      bal: bal || EMPTY,
      months: mo.data || [],
      goal: goals.find((x) => x.status === "active") || null,
      achieved: goals.filter((x) => x.status === "achieved"),
      recent: l.data || [],
    });
  }, [memberId]);
  useEffect(() => {
    setD((x) => ({ ...x, loaded: false }));
    load();
  }, [load]);
  return { ...d, reload: load };
}
