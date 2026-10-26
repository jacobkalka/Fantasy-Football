"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { MAX_TRADE_SIDE } from "@/lib/chat/attachments";
import type { PlayerRef, TradeCard } from "@/lib/chat/types";
import { usePlayerIndex } from "@/lib/hooks/usePlayers";
import { useRoster } from "@/lib/roster/store";
import { PlayerPicker } from "./PlayerPicker";

/** Build a trade for the room to judge: who you'd give and who you'd get (up to 5 each). */
export function TradeComposer({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (trade: TradeCard) => void }) {
  const [give, setGive] = useState<PlayerRef[]>([]);
  const [get, setGet] = useState<PlayerRef[]>([]);
  const { roster } = useRoster();
  const index = usePlayerIndex(open);
  const chosen = new Set([...give, ...get].map((p) => p.id));
  const mine = roster.players
    .map((p) => index.get(p.playerId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && !chosen.has(p!.id))
    .slice(0, 16);

  const side = (label: string, list: PlayerRef[], set: (fn: (l: PlayerRef[]) => PlayerRef[]) => void, showMine: boolean) => (
    <section className="flex flex-col gap-2">
      <h3 className="text-[14px] font-semibold">{label}</h3>
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-full bg-well py-1 pr-1 pl-3 text-[13px]">
              {p.name}
              <button
                type="button"
                onClick={() => set((l) => l.filter((x) => x.id !== p.id))}
                aria-label={`Remove ${p.name}`}
                className="grid size-6 place-items-center rounded-full hover:bg-control"
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length < MAX_TRADE_SIDE && (
        <>
          {showMine && mine.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Your players">
              {mine.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set((l) => [...l, { id: p.id, name: p.name }])}
                  className="pressable rounded-full bg-raised px-3 py-1 text-[13px] hover:bg-well"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <PlayerPicker label="Search players" exclude={chosen} onPick={(p) => set((l) => [...l, { id: p.id, name: p.name }])} />
        </>
      )}
    </section>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Trade to judge"
      description="Attach a trade and ask the room. Only the players are shared, never your league or roster."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={give.length === 0 || get.length === 0}
            onClick={() => {
              onPick({ give, get });
              setGive([]);
              setGet([]);
            }}
          >
            Attach trade
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {side("You give", give, setGive, true)}
        {side("You get", get, setGet, false)}
      </div>
    </Sheet>
  );
}
