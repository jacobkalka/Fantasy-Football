"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/States";
import { adminStatusChanged, refreshAdminStatus, useAdminStatus } from "@/lib/hooks/useEntitlements";
import { useAuth } from "@/lib/supabase/auth";

function untilLabel(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Settings → Admin Mode. Type the administrator code; the server checks it and, if it's right,
 * turns Admin Mode on for this account on this browser until it expires or you turn it off.
 * Wrong codes all get the same answer, and repeated wrong codes lock it for a while.
 */
export function AdminModeSection() {
  const auth = useAuth();
  const admin = useAdminStatus();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function enable(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; active?: boolean; expiresAt?: string };
      setCode("");
      if (response.ok && body.active) adminStatusChanged({ active: true, expiresAt: body.expiresAt ?? null });
      else setMessage(body.error ?? "Couldn't check the code right now. Try again later.");
    } catch {
      setMessage("You seem to be offline. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      await refreshAdminStatus();
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (auth.status === "loading" || admin.status === "loading") body = <Skeleton className="h-11 w-full rounded-xl" />;
  else if (auth.status !== "signed-in")
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[14px] text-muted">Admin Mode is tied to your account. Sign in first.</p>
        <ButtonLink href="/auth/sign-in?next=/settings%23admin" size="sm">
          Sign in
        </ButtonLink>
      </div>
    );
  else if (!admin.available) body = <p className="text-[14px] text-muted">Admin Mode isn&apos;t set up on this server.</p>;
  else if (admin.active)
    body = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="self-start rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-black">ADMIN MODE</span>
          <p className="text-[15px]">Active{admin.expiresAt ? ` · turns off at ${untilLabel(admin.expiresAt)}` : ""}</p>
        </div>
        <Button variant="danger" size="sm" disabled={busy} onClick={() => void disable()}>
          Disable Admin Mode
        </Button>
      </div>
    );
  else
    body = (
      <form onSubmit={enable} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Administrator code</span>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 12));
              setMessage(null);
            }}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? "admin-message" : undefined}
            className="h-11 w-full max-w-[240px] rounded-xl bg-raised px-3 text-[16px] tracking-[0.3em] outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        {message && (
          <p id="admin-message" role="alert" className="text-[14px] text-negative">
            {message}
          </p>
        )}
        <Button type="submit" variant="secondary" size="sm" disabled={busy || code.length === 0} className="self-start">
          {busy ? "Checking…" : "Enable Admin Mode"}
        </Button>
      </form>
    );

  return (
    <Card>
      <h2 id="admin" className="mb-1 flex scroll-mt-20 items-center gap-2 text-[16px] leading-6 font-semibold">
        <Icon name="shield" size={18} className="text-muted" /> Admin Mode
      </h2>
      <p className="mb-4 text-[13px] text-muted">For the app&apos;s administrators. Checked on FantasyLab&apos;s server; nothing changes for anyone else.</p>
      {body}
    </Card>
  );
}
