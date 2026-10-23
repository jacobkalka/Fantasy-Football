import { TiltCard } from "@/components/motion/TiltCard";
import { SUPABASE_SETUP_URL } from "@/lib/supabase/config";

const COPY = {
  accounts: {
    title: "Sign-in is almost here",
    body: "Accounts save your team so it follows you to any phone or laptop, and they unlock chat. They switch on once the app's database (Supabase) is connected, which hasn't happened yet.",
  },
  chat: {
    title: "Chat is almost here",
    body: "A room for everyone, a room for every NFL game, and one for your league. Chat needs accounts, and accounts switch on once the app's database (Supabase) is connected, which hasn't happened yet.",
  },
} as const;

/**
 * Shown on the sign-in, account and chat screens while the database isn't
 * connected. Explains what's missing and that everything else still works.
 */
export function SetupNeeded({ feature }: { feature: keyof typeof COPY }) {
  const copy = COPY[feature];
  return (
    <TiltCard className="glass flex flex-col gap-4 p-6" max={5} style={{ "--glow": "rgb(94 230 255 / 0.35)" } as React.CSSProperties}>
      <div className="flex items-center gap-3" style={{ transform: "translateZ(24px)" }}>
        <span className="glass-chip flex size-11 items-center justify-center rounded-2xl text-sky" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <ellipse cx="12" cy="6" rx="7" ry="3" />
            <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3 1 0 2-.1 2.8-.3" />
            <path d="M18 16v5M15.5 18.5h5" />
          </svg>
        </span>
        <p className="font-mono text-[11px] tracking-[0.1em] text-sky uppercase">Not connected yet</p>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-3xl leading-none font-bold tracking-wide text-ink-strong uppercase">{copy.title}</h2>
        <p className="text-[15px] leading-relaxed text-ink-soft">{copy.body}</p>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Everything else already works on this device: build your team, follow the live feed and watch the games.
        </p>
      </div>
      <a
        href={SUPABASE_SETUP_URL}
        target="_blank"
        rel="noreferrer"
        className="glass-chip pressable flex min-h-11 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[14px] font-semibold text-ink-strong"
      >
        <span>How to connect it: setup guide, part 4</span>
        <span aria-hidden="true" className="text-sky">
          ↗
        </span>
        <span className="sr-only">(opens GitHub in a new tab)</span>
      </a>
    </TiltCard>
  );
}
