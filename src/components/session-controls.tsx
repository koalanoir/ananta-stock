"use client";

import { useEffect, useState } from "react";
import { Clock3, LogOut, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

type SessionControlsProps = {
  role: UserRole;
  compact?: boolean;
};

export function SessionControls({ role, compact = false }: SessionControlsProps) {
  const router = useRouter();
  const [workSessionId, setWorkSessionId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"session" | "logout" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (role !== "seller") return;

    async function loadWorkSession() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: membership } = await supabase
        .from("memberships")
        .select("store_id")
        .eq("user_id", user.id)
        .eq("role", "seller")
        .eq("active", true)
        .maybeSingle();

      setStoreId(membership?.store_id ?? null);

      const { data: existing } = await supabase
        .from("work_sessions")
        .select("id")
        .eq("user_id", user.id)
        .is("closed_at", null)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        setWorkSessionId(existing.id);
      }
    }

    void loadWorkSession();
  }, [role]);

  async function startDay() {
    if (!storeId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPendingAction("session");
    setMessage("");

    const { data, error } = await supabase.rpc("start_work_session", {
      target_store_id: storeId,
      session_note: "Début de journée depuis l’application",
    });

    setPendingAction(null);

    if (error) {
      setMessage("Impossible de démarrer la journée.");
      return;
    }

    const session = Array.isArray(data) ? data[0] : data;
    if (session && typeof session === "object" && "id" in session) {
      setWorkSessionId(String(session.id));
    }
    setMessage("Journée démarrée");
    router.refresh();
  }

  async function endDay() {
    if (!workSessionId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPendingAction("session");
    setMessage("");

    const { error } = await supabase.rpc("end_work_session", {
      target_session_id: workSessionId,
      session_note: "Fin de journée depuis l’application",
    });

    setPendingAction(null);

    if (error) {
      setMessage("Impossible de terminer la journée.");
      return;
    }

    setWorkSessionId(null);
    setMessage("Journée terminée");
    router.refresh();
  }

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPendingAction("logout");
    await fetch("/api/auth/session-context", {
      method: "DELETE",
    });
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {role === "seller" ? (
          <button type="button" onClick={workSessionId ? endDay : startDay} disabled={pendingAction !== null || !storeId} aria-label={workSessionId ? "Terminer la journée" : "Démarrer la journée"} title={workSessionId ? "Fin de journée" : "Début de journée"} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-muted text-brand-strong disabled:opacity-50">
            {pendingAction === "session" ? <LoaderCircle className="animate-spin" size={17} /> : <Clock3 size={17} />}
          </button>
        ) : null}
        <button type="button" onClick={logout} disabled={pendingAction !== null} aria-label="Se déconnecter" title="Se déconnecter" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-muted text-foreground/65 disabled:opacity-50">
          {pendingAction === "logout" ? <LoaderCircle className="animate-spin" size={17} /> : <LogOut size={17} />}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2">
      {role === "seller" ? (
        <button type="button" onClick={workSessionId ? endDay : startDay} disabled={pendingAction !== null || !storeId} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50">
          {pendingAction === "session" ? <LoaderCircle className="animate-spin" size={15} /> : <Clock3 size={15} />}
          {workSessionId ? "Fin de journée" : "Début de journée"}
        </button>
      ) : null}
      <button type="button" onClick={logout} disabled={pendingAction !== null} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-semibold text-white/75 hover:bg-white/8 disabled:opacity-50">
        {pendingAction === "logout" ? <LoaderCircle className="animate-spin" size={15} /> : <LogOut size={15} />}
        Se déconnecter
      </button>
      {message ? <p className="text-center text-[0.68rem] text-white/60">{message}</p> : null}
    </div>
  );
}
