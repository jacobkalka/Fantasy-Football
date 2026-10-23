"use client";

import Link from "next/link";
import { SetupNeeded } from "@/components/auth/SetupNeeded";
import { TiltCard } from "@/components/motion/TiltCard";
import { Skeleton } from "@/components/ui/bits";
import { useAuth } from "@/lib/supabase/auth";

/**
 * Chat is for signed-in people. This shows the right thing for everyone else:
 * a setup note (database not connected), a placeholder (still checking), or a
 * sign-in invitation. Signed-in people get the chat itself (`children(userId)`).
 */
export function ChatGate({ next, children }: { next: string; children: (userId: string) => React.ReactNode }) {
  const auth = useAuth();
  if (auth.status === "disabled") return <SetupNeeded feature="chat" />;
  if (auth.status === "loading") return <Skeleton className="h-64 rounded-3xl" />;
  if (auth.status === "signed-out") {
    return (
      <TiltCard className="glass flex flex-col items-center gap-4 px-6 py-9 text-center" max={6}>
        <span className="text-5xl" aria-hidden="true">
          💬
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[20px] leading-7 font-semibold text-ink">Sign in to chat</h2>
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Talk through every play with everyone, in a room for each game, or with your league. It takes one email.
          </p>
        </div>
        <Link
          href={`/auth/sign-in?next=${encodeURIComponent(next)}`}
          className="glass-gain pressable rounded-2xl px-6 py-3 text-[12px] font-bold text-gain"
          style={{ transform: "translateZ(24px)" }}
        >
          Sign in
        </Link>
      </TiltCard>
    );
  }
  return <>{children(auth.user.id)}</>;
}
