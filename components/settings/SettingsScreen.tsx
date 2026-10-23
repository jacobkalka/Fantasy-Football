"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { appBuildTime, checkForUpdate, InstallSetting, installHint, useInstallRoute } from "@/components/pwa";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { useRoster } from "@/lib/roster/store";
import { LEAGUE_SIZES, settingsActions, useSettings, type LeagueSize } from "@/lib/settings/store";
import { requestDurableStorage } from "@/lib/storage/persisted";

const FORMAT_LABEL = { standard: "Standard", half: "Half PPR", ppr: "PPR" } as const;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[15px] leading-6 font-medium">{label}</p>
        {hint && <p className="text-[13px] leading-5 text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const noSubscribe = () => () => {};
const buildLabel = () =>
  appBuildTime()?.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) ?? null;

/** Install status, version and "check for updates". */
function AppCard() {
  const route = useInstallRoute();
  // Shown in your own time zone, so only in the browser.
  const built = useSyncExternalStore(noSubscribe, buildLabel, () => null);
  const [check, setCheck] = useState<"idle" | "checking" | "ready" | "current" | "unavailable">("idle");
  const result = {
    idle: null,
    checking: "Checking…",
    ready: "A new version is ready: tap Update at the bottom of the screen.",
    current: "You have the newest version.",
    unavailable: "Can't check right now (offline, or updates aren't running in this browser).",
  }[check];

  return (
    <Card>
      <h2 className="mb-4 text-[16px] leading-6 font-semibold">The app</h2>
      <div className="flex flex-col divide-y divide-rule">
        <Row label="Install the app" hint={installHint(route)}>
          <InstallSetting />
        </Row>
        <Row
          label="Updates"
          hint={result ?? `New versions download by themselves and switch over when you tap Update.${built ? ` This one is from ${built}.` : ""}`}
        >
          <Button
            size="sm"
            icon="refresh"
            disabled={check === "checking"}
            onClick={async () => {
              setCheck("checking");
              setCheck(await checkForUpdate());
            }}
          >
            Check now
          </Button>
        </Row>
      </div>
    </Card>
  );
}

export function SettingsScreen() {
  const { value: settings, ready } = useSettings();
  const { roster } = useRoster();
  const [durable, setDurable] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setDurable).catch(() => setDurable(null));
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card>
        <h2 className="mb-4 text-[16px] leading-6 font-semibold">Your league</h2>
        <div className="flex flex-col divide-y divide-rule">
          <Row label="Teams in your league" hint="Ratings and “likely available” pickups depend on it.">
            <Segmented
              options={LEAGUE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              value={String(settings.leagueSize)}
              onChange={(v) => settingsActions.setLeagueSize(Number(v) as LeagueSize)}
              label="Teams in your league"
              size="sm"
            />
          </Row>
          <Row label="Scoring" hint={`${FORMAT_LABEL[roster.format]}. Set with your roster.`}>
            <ButtonLink href="/team/edit" size="sm">
              Change
            </ButtonLink>
          </Row>
          <Row
            label="Players taken in your league"
            hint={`${settings.taken.length} marked. Pickups skip them.`}
          >
            <button
              type="button"
              disabled={!settings.taken.length}
              onClick={settingsActions.clearTaken}
              className="h-8 rounded-full px-3 text-[13px] text-muted hover:bg-raised hover:text-ink disabled:text-faint"
            >
              Clear list
            </button>
          </Row>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-[16px] leading-6 font-semibold">Look and feel</h2>
        <div className="flex flex-col divide-y divide-rule">
          <Row
            label="Liquid glass"
            hint="The see-through tab bar. Off uses a plain dark bar (saves battery on older phones)."
          >
            <Segmented
              options={[
                { value: "auto", label: "On" },
                { value: "off", label: "Off" },
              ]}
              value={ready ? settings.glass : "auto"}
              onChange={settingsActions.setGlass}
              label="Liquid glass"
              size="sm"
            />
          </Row>
          <Row
            label="Animations"
            hint="Full always shows every animation. Match device follows your phone's Reduce Motion switch."
          >
            <Segmented
              options={[
                { value: "full", label: "Full" },
                { value: "reduced", label: "Reduced" },
                { value: "device", label: "Match device" },
              ]}
              value={ready ? settings.motion : "device"}
              onChange={settingsActions.setMotion}
              label="Animations"
              size="sm"
            />
          </Row>
        </div>
      </Card>

      <AppCard />

      <Card>
        <h2 className="mb-4 text-[16px] leading-6 font-semibold">Your data</h2>
        <div className="flex flex-col divide-y divide-rule">
          <Row
            label="Saved on this device"
            hint={
              durable
                ? "Your browser has agreed to keep it, even when space runs low."
                : "Kept until you clear this site's data. iPhone Safari may clear sites you haven't opened in 7 days; adding FantasyLab to your Home Screen avoids that."
            }
          >
            {durable === false && (
              <button
                type="button"
                onClick={() => void requestDurableStorage().then(setDurable)}
                className="h-8 rounded-full px-3 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-control)] hover:bg-raised"
              >
                Keep it safe
              </button>
            )}
          </Row>
          <Row
            label="On another phone or browser"
            hint="Each browser, web address and iPhone Home Screen app keeps its own saved data. Sign in, or send yourself a team link."
          >
            <div className="flex gap-2">
              <ButtonLink href="/team/edit" size="sm" icon="share">
                Team link
              </ButtonLink>
              <ButtonLink href="/account" size="sm" icon="user">
                Account
              </ButtonLink>
            </div>
          </Row>
          <Row label="Data sources" hint="Scores, stats, projections, injuries and news come from ESPN and update through the day.">
            <Link href="/team" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
              Your lineup <Icon name="chevronRight" size={14} />
            </Link>
          </Row>
        </div>
      </Card>
    </div>
  );
}
