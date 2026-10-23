"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { teamCodeFrom } from "@/lib/roster/share";
import { useInstallRoute } from "./install";

/**
 * The installed app opened with no team. On iPhone and iPad the Home Screen app has its own
 * storage, separate from Safari, so a team built in Safari isn't here yet. Paste the team link
 * (Settings → Install the app tells you to copy it first), or sign in if the team is saved to
 * an account. Shown only inside the installed app.
 */
export function BringYourTeam() {
  const route = useInstallRoute();
  const router = useRouter();
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (route !== "installed") return null;

  const open = (code: string) => router.push(`/team/import?t=${code}`);

  const paste = async () => {
    setProblem(null);
    try {
      const code = teamCodeFrom(await navigator.clipboard.readText());
      if (code) return open(code);
      setProblem("What you copied isn't a team link. Copy it again from Safari, or paste it below.");
    } catch {
      // Clipboard reading blocked or declined: paste by hand instead.
    }
    setManual(true);
  };

  const onText = (value: string) => {
    setText(value);
    const code = teamCodeFrom(value);
    if (code) open(code);
    else setProblem(value.trim() ? "That doesn't look like a team link." : null);
  };

  return (
    <Card className="flex flex-col gap-4 lg:col-span-2" aria-labelledby="bring-team-title">
      <div>
        <h2 id="bring-team-title" className="text-[16px] leading-6 font-semibold">
          Built your team in the browser?
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">
          The Home Screen app keeps its own saved data, separate from your browser, so your team isn&apos;t here yet. Paste
          the team link you copied, or sign in if your team is saved to an account.
        </p>
      </div>
      {manual && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Team link</span>
          <input
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder="Paste it here"
            autoFocus
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 rounded-xl bg-raised px-3.5 text-[16px] text-ink placeholder:text-faint focus:ring-2 focus:ring-accent focus:outline-none"
          />
        </label>
      )}
      {problem && (
        <p role="alert" className="text-[13px] leading-5 text-warning">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!manual && (
          <Button variant="primary" icon="copy" onClick={paste}>
            Paste team link
          </Button>
        )}
        <ButtonLink href="/auth/sign-in?next=/" icon="user">
          Sign in
        </ButtonLink>
      </div>
    </Card>
  );
}
