"use client";

/**
 * What the server says you're entitled to, for showing it (the ADMIN MODE indicator, the
 * Settings section). Never the source of truth: every gated thing is checked again on the
 * server. Shared by every caller and refreshed after Admin Mode changes.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/supabase/auth";

export interface AdminStatus {
  status: "loading" | "ready" | "error";
  available: boolean;
  active: boolean;
  expiresAt: string | null;
}

const LOADING: AdminStatus = { status: "loading", available: false, active: false, expiresAt: null };
let state: AdminStatus = LOADING;
let fetchedFor: string | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: AdminStatus) {
  state = next;
  listeners.forEach((l) => l());
  clearTimeout(expiryTimer);
  // It turns itself off on the server at expiry; follow along without a reload.
  if (next.active && next.expiresAt) {
    const ms = Date.parse(next.expiresAt) - Date.now();
    if (ms > 0 && ms < 2 ** 31) expiryTimer = setTimeout(() => void refreshAdminStatus(), ms + 1000);
  }
}

export async function refreshAdminStatus() {
  try {
    const response = await fetch("/api/admin/session", { cache: "no-store" });
    const body = (await response.json()) as Partial<AdminStatus>;
    if (!response.ok) throw new Error(String(response.status));
    set({ status: "ready", available: Boolean(body.available), active: Boolean(body.active), expiresAt: body.expiresAt ?? null });
  } catch {
    set({ ...state, status: "error" });
  }
}

export function adminStatusChanged(next: { active: boolean; expiresAt: string | null }) {
  set({ status: "ready", available: true, ...next });
}

export function useAdminStatus(): AdminStatus {
  const auth = useAuth();
  const who = auth.status === "signed-in" ? auth.user.id : auth.status;
  useEffect(() => {
    if (who === "loading" || fetchedFor === who) return;
    fetchedFor = who;
    void refreshAdminStatus();
  }, [who]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => LOADING,
  );
}
