"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Login from "@/components/Login";
import Shell from "@/components/Shell";

export default function Page() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  if (userId === undefined) return <div className="splash">載入中…</div>;
  return userId ? <Shell key={userId} userId={userId} /> : <Login />;
}
