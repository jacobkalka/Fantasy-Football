"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import type { RoomNotice } from "@/lib/chat/room-store";

/** A short note above the message box: "Blocked @x · Undo", "Couldn't add that reaction". */
export function RoomNoticeBar({ notice, onDismiss }: { notice: RoomNotice | null; onDismiss: () => void }) {
  // Plain confirmations fade after a while; errors and anything with Undo stay until dismissed.
  const lasting = !notice || notice.tone === "error" || Boolean(notice.action);
  useEffect(() => {
    if (lasting) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [notice, lasting, onDismiss]);
  if (!notice) return null;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2 text-[13px]"
    >
      <Icon name={notice.tone === "error" ? "alert" : "info"} size={16} className={notice.tone === "error" ? "text-negative" : "text-muted"} />
      <span className="min-w-0 flex-1">{notice.text}</span>
      {notice.action && (
        <button
          type="button"
          onClick={() => {
            notice.action?.run();
          }}
          className="font-medium text-ink hover:underline"
        >
          {notice.action.label}
        </button>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid size-7 place-items-center rounded-full text-muted hover:bg-well">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
