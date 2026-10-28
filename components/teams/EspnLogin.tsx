"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export interface EspnConnectionStatus {
  available: boolean;
  connected: boolean;
  status: "active" | "expired" | "error" | null;
  signedIn?: boolean;
}

export function useEspnConnection() {
  const [state, setState] = useState<EspnConnectionStatus | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/espn/connection", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: EspnConnectionStatus) => alive && setState(body))
      .catch(() => alive && setState({ available: false, connected: false, status: null }));
    return () => {
      alive = false;
    };
  }, [tick]);
  return { state, reload: () => setTick((t) => t + 1) };
}

/**
 * Your ESPN login for private leagues: two cookie values ESPN sets when you sign in on
 * espn.com. They're sent once to FantasyLab's server, encrypted (AES-256-GCM) and stored
 * there; this device never keeps them, and Disconnect deletes them.
 */
export function EspnLogin({ onConnected }: { onConnected?: () => void }) {
  const { state, reload } = useEspnConnection();
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/espn/connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ espnS2: s2, swid }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save it.");
      setS2("");
      setSwid("");
      reload();
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save it.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/espn/connection", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    reload();
  }

  if (state && !state.available) {
    return <p className="text-[14px] text-muted">Private leagues aren&apos;t set up on this server yet (it needs its encryption key). Public leagues work.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {state?.connected && (
        <div className="well flex items-center gap-3 p-3">
          <Icon name={state.status === "active" ? "check" : "alert"} className={state.status === "active" ? "text-positive" : "text-warning"} />
          <p className="flex-1 text-[14px]">
            {state.status === "active" ? "ESPN is connected." : "ESPN login expired. Paste fresh values below."}
          </p>
          <Button size="sm" variant="danger" onClick={disconnect} disabled={busy}>
            Disconnect
          </Button>
        </div>
      )}
      <form onSubmit={save} className="flex flex-col gap-3">
        <details className="well p-3 text-[13px] text-muted">
          <summary className="cursor-pointer font-medium text-ink">Where do I find these?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>On a computer, sign in at espn.com and open your fantasy league.</li>
            <li>Open the browser&apos;s developer tools (F12 or ⌥⌘I), then Application (Chrome) or Storage (Firefox, Safari) → Cookies → espn.com.</li>
            <li>Copy the values of <span className="text-ink">espn_s2</span> (a long string) and <span className="text-ink">SWID</span> (in curly braces).</li>
          </ol>
          <p className="mt-2">They let Xpert read your private leagues, nothing else. They&apos;re encrypted on our server and you can disconnect any time.</p>
        </details>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          espn_s2
          <input
            value={s2}
            onChange={(e) => setS2(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-[16px] text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          SWID
          <input
            value={swid}
            onChange={(e) => setSwid(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
            className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        </label>
        {error && <p className="text-[13px] text-negative">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy || !s2 || !swid} className="self-start">
          {busy ? "Saving…" : state?.connected ? "Update ESPN login" : "Connect ESPN"}
        </Button>
      </form>
    </div>
  );
}
