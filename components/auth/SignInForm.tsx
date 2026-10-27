"use client";

import { Enter } from "@/components/motion/Enter";
import { Icon } from "@/components/ui/Icon";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useInstallRoute } from "@/components/pwa/install";
import { Skeleton } from "@/components/ui/bits";
import { fetchSignInOptions, sendSignInEmail, signInWithGoogle, useAuth, verifySignInCode } from "@/lib/supabase/auth";
import { friendlyAuthError } from "@/lib/supabase/auth-errors";
import { safeNextPath } from "@/lib/supabase/redirect";
import { SetupNeeded } from "./SetupNeeded";

const INPUT =
  "h-12 w-full rounded-xl bg-raised px-4 text-[16px] text-ink placeholder:text-faint outline-none focus-visible:ring-2 focus-visible:ring-accent";
const PRIMARY =
  "pressable flex h-12 w-full items-center justify-center rounded-full bg-ink px-4 text-[15px] font-medium text-black disabled:bg-well disabled:text-faint";

function ErrorText({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-[14px] leading-snug text-negative">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Sign in or sign up (same thing): enter your email, then tap the link we send
 * or type the code from it. Or use Google, when it's switched on.
 */
export function SignInForm() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const linkError = params.get("error");

  const [step, setStep] = useState<"email" | "code">("email");
  const installedApp = useInstallRoute() === "installed";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? friendlyAuthError({ code: linkError }) : null);
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => {
    if (auth.status === "disabled") return;
    let alive = true;
    void fetchSignInOptions().then((options) => alive && setGoogleOn(options?.google ?? false));
    return () => {
      alive = false;
    };
  }, [auth.status]);

  // Signed in (with the code, or already): carry on to where they were going.
  useEffect(() => {
    if (auth.status === "signed-in") router.replace(next);
  }, [auth.status, next, router]);

  if (auth.status === "disabled") return <SetupNeeded feature="accounts" />;
  if (auth.status === "loading" || auth.status === "signed-in") return <Skeleton className="h-72 rounded-3xl" />;

  async function onSendEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await sendSignInEmail(email, next);
    setBusy(false);
    if (result.error) setError(result.error);
    else setStep("code");
  }

  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await verifySignInCode(email, code);
    setBusy(false);
    if (result.error) setError(result.error);
    // Success: the effect above moves on once the session arrives.
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle(next);
    // On success the browser is already on its way to Google.
    if (result.error) {
      setBusy(false);
      setError(result.error);
    }
  }

  return (
    // A plain (non-tilting) card: text fields inside 3D-tilted elements can glitch on iPhones.
    <div className="card flex flex-col gap-5 overflow-hidden p-6">
      {step === "email" ? (
        <Enter key="email" from={{ x: -16 }}>
          <form onSubmit={onSendEmail} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[20px] leading-7 font-semibold text-ink">Save your team. Join the chat.</h2>
              <p className="text-[15px] leading-relaxed text-muted">
                Type your email and we&apos;ll send you a sign-in link. No password needed. New here? The same link creates your
                account.
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
                aria-describedby={error ? "signin-error" : undefined}
              />
            </label>
            {error && <ErrorText id="signin-error">{error}</ErrorText>}
            <button type="submit" className={PRIMARY} disabled={busy || !email.includes("@")}>
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
            {googleOn && (
              <>
                <div className="flex items-center gap-3 text-[12px] text-muted" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>
                <button
                  type="button"
                  onClick={onGoogle}
                  disabled={busy}
                  className="pressable flex h-12 w-full items-center justify-center gap-2.5 rounded-full px-4 text-[15px] font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-control)] hover:bg-raised disabled:text-faint"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                    <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
                    <path
                      d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
                      opacity=".8"
                    />
                    <path d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.1L6.4 14Z" opacity=".6" />
                    <path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z" opacity=".9" />
                  </svg>
                  Continue with Google
                </button>
              </>
            )}
            <p className="text-[12.5px] leading-relaxed text-muted">
              We only use your email to sign you in. Your username is what others see in chat.
            </p>
          </form>
        </Enter>
      ) : (
        <Enter key="code" from={{ x: 16 }}>
          <form onSubmit={onVerify} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-[13px] text-muted">Check your email</p>
              <h2 className="text-[20px] leading-7 font-semibold text-ink">One tap away</h2>
              <p className="text-[15px] leading-relaxed text-muted">
                We sent a sign-in link to <strong className="text-ink">{email}</strong>.{" "}
                {installedApp
                  ? "Type the code from the email here: in the Home Screen app, the link would open your browser instead."
                  : "Open it on this device. If the email shows a code, you can type it here instead."}
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">Code from the email</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                maxLength={10}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${INPUT}`}
                aria-describedby={error ? "code-error" : undefined}
              />
            </label>
            {error && <ErrorText id="code-error">{error}</ErrorText>}
            <button type="submit" className={PRIMARY} disabled={busy || code.length < 6}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="min-h-11 rounded-xl px-3 text-[13.5px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Use a different email
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const result = await sendSignInEmail(email, next);
                  setBusy(false);
                  setError(result.error ?? null);
                }}
                className="min-h-11 rounded-xl px-3 text-[13.5px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Send a new email
              </button>
            </div>
          </form>
        </Enter>
      )}
    </div>
  );
}
