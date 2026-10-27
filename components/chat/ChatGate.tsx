"use client";

import { SetupNeeded } from "@/components/auth/SetupNeeded";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/bits";
import { useAuth } from "@/lib/supabase/auth";

/**
 * Chat is for signed-in people. This shows the right thing for everyone else: a setup note
 * (database not connected), a placeholder (still checking), or a sign-in invitation.
 * Signed-in people get the chat itself (`children(userId)`).
 */
export function ChatGate({ next, children }: { next: string; children: (userId: string) => React.ReactNode }) {
  const auth = useAuth();
  if (auth.status === "signed-in") return <>{children(auth.user.id)}</>;
  return (
    <div className="flex flex-col gap-4 pt-1 lg:pt-6">
      <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.02em]">Chat</h1>
      {auth.status === "disabled" ? (
        <SetupNeeded feature="chat" />
      ) : auth.status === "loading" ? (
        <Skeleton className="h-64 rounded-[20px]" />
      ) : (
        <SignInInvite next={next} />
      )}
    </div>
  );
}

function SignInInvite({ next }: { next: string }) {
  return (
    <div className="card flex flex-col items-start gap-4 p-6">
      <Icon name="chat" className="text-muted" />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[20px] leading-7 font-semibold">Sign in to chat</h2>
        <p className="max-w-md text-[15px] leading-relaxed text-muted">
          Talk start/sit, trades and waivers with other fans, follow every game in its own room, and get a private room with your
          league. It takes one email.
        </p>
      </div>
      <ButtonLink href={`/auth/sign-in?next=${encodeURIComponent(next)}`} variant="primary" size="lg">
        Sign in
      </ButtonLink>
    </div>
  );
}
