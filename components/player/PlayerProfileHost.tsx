"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { closePlayer } from "@/lib/nav/query";
import { PlayerProfile } from "./PlayerProfile";

/**
 * Mounted once in the root layout: whenever the URL has ?player=<id> (any screen), the one
 * player profile opens over that screen in a large sheet. The screen underneath keeps its
 * state and scroll; Back or Close returns to it. Mounted inside <Suspense> (it reads the URL).
 */
export function PlayerProfileHost() {
  const params = useSearchParams();
  const raw = params.get("player");
  const id = raw && /^-?\d{1,12}$/.test(raw) ? raw : null;
  // Keep the last player on screen while the sheet animates closed.
  const [shown, setShown] = useState<string | null>(id);
  if (id && id !== shown) setShown(id);

  return (
    <Sheet open={Boolean(id)} onClose={closePlayer} title="Player profile" hideTitle size="xl">
      {shown && (
        <div className="flex flex-col gap-4 pt-1">
          <PlayerProfile key={shown} playerId={shown} inSheet />
          <ButtonLink href={`/players/${shown}`} variant="quiet" iconRight="external" className="self-center">
            Open as a full page
          </ButtonLink>
        </div>
      )}
    </Sheet>
  );
}
