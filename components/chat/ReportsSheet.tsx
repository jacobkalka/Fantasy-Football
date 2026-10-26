"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { deleteMessage, dismissReport, fetchReports, type ReportRow } from "@/lib/chat/api";
import { sinceLabel } from "@/lib/chat/time";
import { useNow } from "@/lib/hooks/useNow";
import { requireSupabase } from "@/lib/supabase/client";

/**
 * The moderation queue, for moderators only. The database decides who that is (profiles.is_admin,
 * set by the project owner) and refuses everyone else, whatever this screen shows.
 */
function ReportsQueue() {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const now = useNow(60_000);

  useEffect(() => {
    let alive = true;
    requireSupabase()
      .then(fetchReports)
      .then((rows) => alive && (setReports(rows), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tick]);

  async function act(report: ReportRow, remove: boolean) {
    setBusy(report.id);
    try {
      const supabase = await requireSupabase();
      if (remove && report.message && !report.message.deleted) await deleteMessage(supabase, report.message.id);
      await dismissReport(supabase, report.id);
      setReports((list) => list?.filter((r) => r.id !== report.id) ?? null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <ErrorState what="Couldn't load reports." onRetry={() => setTick((t) => t + 1)} />;
  if (!reports) return <SkeletonRows rows={3} height={72} />;
  if (reports.length === 0) return <p className="text-[14px] text-muted">No open reports. Nice and quiet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {reports.map((report) => (
        <li key={report.id} className="flex flex-col gap-2 rounded-xl bg-raised p-3">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-faint">
            <span className="font-medium text-ink">@{report.author?.username ?? "unknown"}</span>
            <span>{sinceLabel(report.createdAt, now)}</span>
            {report.message?.deleted && <span>· already deleted</span>}
          </p>
          <p className="text-[14px] leading-5 break-words">{report.body || "(no text)"}</p>
          <p className="text-[13px] text-muted">Reason: {report.reason || "Not given"}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy === report.id} onClick={() => void act(report, true)}>
              Delete message
            </Button>
            <Button size="sm" disabled={busy === report.id} onClick={() => void act(report, false)}>
              Dismiss
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReportsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Moderation reports"
        className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
      >
        <Icon name="flag" size={18} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Reports" description="Messages people reported, newest first.">
        {open && <ReportsQueue />}
      </Sheet>
    </>
  );
}
