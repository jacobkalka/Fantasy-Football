"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { closeUser } from "@/lib/nav/query";
import { UserProfile } from "./UserProfile";

/**
 * Mounted once in the root layout: ?user=<username> on any screen opens that person's public
 * profile over it (from a name or picture in chat). Back or Close returns to the screen.
 */
export function UserProfileHost() {
  const params = useSearchParams();
  const raw = params.get("user");
  const username = raw && /^[a-z0-9_]{3,24}$/.test(raw) ? raw : null;
  const [shown, setShown] = useState<string | null>(username);
  if (username && username !== shown) setShown(username);
  return (
    <Sheet open={Boolean(username)} onClose={closeUser} title="Profile" hideTitle size="lg">
      {shown && (
        <div className="flex flex-col gap-4 pt-1">
          <UserProfile key={shown} username={shown} />
          <ButtonLink href={`/u/${shown}`} variant="quiet" iconRight="external" className="self-center">
            Open as a full page
          </ButtonLink>
        </div>
      )}
    </Sheet>
  );
}
