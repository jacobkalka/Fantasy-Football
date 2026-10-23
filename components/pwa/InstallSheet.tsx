"use client";

import { useState } from "react";
import { Mark } from "@/components/shell/Brand";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { APP_NAME } from "@/lib/config";
import { teamLink } from "@/lib/roster/share";
import { useRoster } from "@/lib/roster/store";
import { promptInstall, type InstallRoute } from "./install";

/** An icon drawn inline with the words, the way it looks on the phone. */
function Glyph({ name, label }: { name: IconName; label: string }) {
  return (
    <span className="mx-0.5 inline-grid size-6 translate-y-[3px] place-items-center rounded-md bg-well text-ink" aria-label={label} role="img">
      <Icon name={name} size={16} strokeWidth={name === "more" || name === "moreVertical" ? 3 : 1.8} />
    </span>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col gap-4">{children}</ol>;
}

function Step({ n, children, detail }: { n: number; children: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-well text-[13px] font-semibold">{n}</span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] leading-6">{children}</p>
        {detail && <p className="mt-0.5 text-[13px] leading-5 text-muted">{detail}</p>}
      </div>
    </li>
  );
}

/** Copies text, and says so. Falls back to showing it selected when the clipboard is blocked. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("manual");
    }
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="sm" icon={state === "copied" ? "check" : "copy"} onClick={copy}>
        {state === "copied" ? "Copied" : label}
      </Button>
      {state === "manual" && (
        <input
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          aria-label="Copy this link"
          className="h-10 w-full rounded-xl bg-raised px-3 text-[16px] text-ink"
        />
      )}
    </div>
  );
}

/**
 * On iPhone the Home Screen app has its own storage, separate from Safari, so a team saved
 * in Safari isn't there when the app first opens. Copying the team link first fixes that.
 */
function CarryTeamStep({ n }: { n: number }) {
  const { roster } = useRoster();
  if (roster.players.length === 0) return null;
  return (
    <Step
      n={n}
      detail={
        <>
          On iPhone and iPad, the Home Screen app keeps its own saved data, separate from this browser. You&apos;ll
          paste this link in the app to bring your {roster.players.length} players over.
          <span className="mt-2 block">
            <CopyButton text={teamLink(roster, window.location.origin)} label="Copy team link" />
          </span>
        </>
      }
    >
      Copy your team link first
    </Step>
  );
}

function IosSteps({ browser }: { browser: "safari" | "other" }) {
  const { roster } = useRoster();
  const carry = roster.players.length > 0 ? 1 : 0;
  return (
    <Steps>
      <CarryTeamStep n={1} />
      {browser === "safari" ? (
        <Step n={1 + carry} detail="It's in the toolbar. On iOS 26, tap the ••• button first, then Share.">
          Tap the Share button <Glyph name="share" label="Share" />
        </Step>
      ) : (
        <Step n={1 + carry} detail="Chrome: top right of the address bar. Firefox and Edge: in the menu at the bottom.">
          Tap the Share button <Glyph name="share" label="Share" />
        </Step>
      )}
      <Step n={2 + carry} detail="You may need to scroll down the list, or tap View More.">
        Tap <strong className="font-semibold">Add to Home Screen</strong> <Glyph name="addSquare" label="Add to Home Screen" />
      </Step>
      <Step n={3 + carry} detail={browser === "safari" ? "If you see Open as Web App, leave it switched on." : undefined}>
        Tap <strong className="font-semibold">Add</strong>
      </Step>
      <Step n={4 + carry}>
        Open {APP_NAME} from your Home Screen{carry ? " and tap Paste team link" : ""}
      </Step>
    </Steps>
  );
}

function RouteSteps({ route, onInstalled }: { route: InstallRoute; onInstalled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);

  switch (route) {
    case "installed":
      return <p className="text-[15px] leading-6">You&apos;re using the installed app. Nothing else to do.</p>;
    case "just-installed":
      return (
        <p className="text-[15px] leading-6">
          Installed. Open {APP_NAME} from your Home Screen or app list; it opens straight to your team.
        </p>
      );
    case "prompt":
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[15px] leading-6">Your browser can install it in one tap. It takes a second and uses almost no space.</p>
          <Button
            variant="primary"
            size="lg"
            icon="download"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const outcome = await promptInstall().finally(() => setBusy(false));
              if (outcome === "accepted") onInstalled();
              else setDeclined(true);
            }}
          >
            Install {APP_NAME}
          </Button>
          {declined && (
            <p className="text-[13px] leading-5 text-muted">
              No problem. You can install it any time from Settings, or from the install icon in the address bar.
            </p>
          )}
        </div>
      );
    case "ios-safari":
      return <IosSteps browser="safari" />;
    case "ios-browser":
      return <IosSteps browser="other" />;
    case "ios-in-app":
      return (
        <Steps>
          <Step
            n={1}
            detail={
              <>
                This app&apos;s built-in browser can&apos;t add sites to your Home Screen. Tap ••• or the compass{" "}
                <Glyph name="compass" label="Safari" /> and choose Open in Safari, or copy the link and paste it into Safari.
                <span className="mt-2 block">
                  <CopyButton text={window.location.href} label="Copy link" />
                </span>
              </>
            }
          >
            Open this page in Safari
          </Step>
          <Step n={2}>In Safari, open Settings → Install the app, and follow the steps there</Step>
        </Steps>
      );
    case "android-menu":
      return (
        <Steps>
          <Step n={1}>
            Open the browser menu <Glyph name="moreVertical" label="Menu" />
          </Step>
          <Step n={2} detail="The wording depends on the browser.">
            Tap <strong className="font-semibold">Install app</strong> or <strong className="font-semibold">Add to Home screen</strong>
          </Step>
          <Step n={3}>Confirm, then open {APP_NAME} from your Home screen</Step>
        </Steps>
      );
    case "mac-safari":
      return (
        <Steps>
          <Step n={1} detail="Needs macOS Sonoma or later.">
            In the menu bar, choose <strong className="font-semibold">File → Add to Dock</strong>
          </Step>
          <Step n={2}>Click Add. {APP_NAME} opens in its own window from the Dock</Step>
        </Steps>
      );
    case "desktop-menu":
      return (
        <Steps>
          <Step
            n={1}
            detail="No icon? Chrome: menu ⋮ → Cast, save and share → Install page as app. Edge: menu → Apps → Install this site as an app. If it's already installed, the same icon opens it."
          >
            Click the install icon <Glyph name="download" label="Install" /> at the right end of the address bar
          </Step>
          <Step n={2}>Click Install. {APP_NAME} opens in its own window and gets a dock or taskbar icon</Step>
        </Steps>
      );
    case "unsupported":
      return (
        <p className="text-[15px] leading-6">
          Firefox on a computer can&apos;t install web apps. Open {APP_NAME} in Chrome, Edge or Safari to install it, or
          keep this tab bookmarked. On your phone, any browser works.
        </p>
      );
  }
}

/** How to install FantasyLab on this device: one tap where the browser allows it, clear steps everywhere else. */
export function InstallSheet({
  open,
  onClose,
  route,
}: {
  open: boolean;
  onClose: () => void;
  route: InstallRoute | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Install ${APP_NAME}`} size="sm">
      <div className="flex flex-col gap-5 pb-2">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-[13px] bg-raised">
            <Mark size={24} />
          </span>
          <p className="text-[14px] leading-5 text-muted">
            Opens full screen from your Home Screen like any app, straight to your team. Screens you&apos;ve opened still
            show without a connection.
          </p>
        </div>
        {route && <RouteSteps route={route} onInstalled={onClose} />}
      </div>
    </Sheet>
  );
}
