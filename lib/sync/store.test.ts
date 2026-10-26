import { describe, expect, it, vi } from "vitest";
import { dataAgeMs, freshness, LIVE_STALE_MS, serverAgeMs } from "./freshness";
import { MOUNT_REFRESH_MS, SyncStore, WATCHDOG_MS, type SyncEnvironment } from "./store";

/** A fake clock, timers and network. */
function setup(respond: (url: string, n: number) => unknown = () => ({ ok: true })) {
  let now = 1_000_000;
  let visible = true;
  let calls = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const fetchMock = vi.fn(async (url: string) => {
    calls += 1;
    const body = respond(url, calls);
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const env: SyncEnvironment = {
    fetch: fetchMock as unknown as typeof fetch,
    now: () => now,
    isVisible: () => visible,
    setTimeout: ((fn: () => void, ms = 0) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    }) as unknown as typeof setTimeout,
    clearTimeout: ((id: number) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    }) as unknown as typeof clearTimeout,
  };
  const store = new SyncStore(env);
  return {
    store,
    fetchMock,
    flush: () => new Promise((r) => setTimeout(r, 0)),
    /** Move the clock forward, firing due timers. */
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > target) break;
        timers.shift();
        now = next.at;
        next.fn();
        await new Promise((r) => setTimeout(r, 0));
      }
      now = target;
    },
    /** Move the clock without firing timers (a frozen tab). */
    freeze(ms: number) {
      now += ms;
    },
    setVisible(v: boolean) {
      visible = v;
    },
  };
}

describe("SyncStore", () => {
  it("shares one request between every subscriber of a URL", async () => {
    const t = setup();
    const a = t.store.subscribe("/api/live", 8000, () => {});
    const b = t.store.subscribe("/api/live", 8000, () => {});
    await t.flush();
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(t.store.snapshot("/api/live").data).toEqual({ ok: true });
    a();
    b();
  });

  it("polls at the fastest interval asked for, and stops when nobody is listening", async () => {
    const t = setup();
    const slow = t.store.subscribe("/u", 60_000, () => {});
    const fast = t.store.subscribe("/u", 8_000, () => {});
    await t.flush();
    expect(t.store.intervalFor("/u")).toBe(8_000);
    await t.advance(8_000);
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
    fast();
    slow();
    await t.advance(120_000);
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a data-dependent interval (fast while live)", async () => {
    const t = setup((_, n) => ({ anyLive: n === 1 }));
    t.store.subscribe<{ anyLive: boolean }>("/live", (d) => (d?.anyLive ? 8_000 : 60_000), () => {});
    await t.flush();
    expect(t.store.intervalFor("/live")).toBe(8_000);
    await t.advance(8_000);
    expect(t.store.intervalFor("/live")).toBe(60_000);
  });

  it("refetches on mount only when its copy is old", async () => {
    const t = setup();
    const a = t.store.subscribe("/x", 60_000, () => {});
    await t.flush();
    const b = t.store.subscribe("/x", 60_000, () => {});
    await t.flush();
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    await t.advance(MOUNT_REFRESH_MS + 1);
    const c = t.store.subscribe("/x", 60_000, () => {});
    await t.flush();
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
    a();
    b();
    c();
  });

  it("doesn't poll while hidden and catches up when the app comes back", async () => {
    const t = setup();
    t.store.subscribe("/x", 8_000, () => {});
    await t.flush();
    t.setVisible(false);
    await t.advance(30_000);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    t.setVisible(true);
    t.store.resume();
    await t.flush();
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("watchdog refetches when timers were frozen without a visibility change", async () => {
    const t = setup();
    t.store.subscribe("/x", 8_000, () => {});
    await t.flush();
    t.freeze(8_000 + WATCHDOG_MS + 1);
    t.store.watchdog();
    await t.flush();
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good data on failure and backs off", async () => {
    const t = setup((_, n) => (n === 1 ? { v: 1 } : new Error("down")));
    t.store.subscribe("/x", 8_000, () => {});
    await t.flush();
    await t.advance(8_000);
    const s = t.store.snapshot<{ v: number }>("/x");
    expect(s.data).toEqual({ v: 1 });
    expect(s.error).toBe("down");
    expect(t.store.intervalFor("/x")).toBe(16_000);
  });

  it("invalidate refetches matching URLs on screen", async () => {
    const t = setup();
    t.store.subscribe("/api/live?ids=1", 60_000, () => {});
    t.store.subscribe("/api/news", 60_000, () => {});
    await t.flush();
    t.store.invalidate("/api/live");
    await t.flush();
    expect(t.fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("freshness", () => {
  it("measures age from server stamps plus time on this device", () => {
    const stamps = { fetchedAt: "2026-10-26T12:00:00.000Z", servedAt: "2026-10-26T12:00:03.000Z" };
    expect(serverAgeMs(stamps)).toBe(3000);
    expect(dataAgeMs(stamps, 1000, 6000)).toBe(8000);
  });

  it("ignores the phone's clock: a wrong device clock can't fake a delay", () => {
    // Server stamps are hours apart from the device clock; only the differences matter.
    const stamps = { fetchedAt: "2020-01-01T00:00:00.000Z", servedAt: "2020-01-01T00:00:02.000Z" };
    const age = dataAgeMs(stamps, Date.parse("2030-01-01"), Date.parse("2030-01-01") + 4000);
    expect(age).toBe(6000);
    expect(freshness({ hasData: true, ageMs: age, live: true, error: null })).toBe("live");
  });

  it("only says delayed with evidence", () => {
    expect(freshness({ hasData: true, ageMs: LIVE_STALE_MS + 1, live: true, error: null })).toBe("delayed");
    // Old data when nothing is live isn't delayed.
    expect(freshness({ hasData: true, ageMs: 3_600_000, live: false, error: null })).toBe("idle");
    // A failed poll with fresh data on screen isn't delayed yet.
    expect(freshness({ hasData: true, ageMs: 9_000, live: true, error: "boom" })).toBe("live");
    expect(freshness({ hasData: false, ageMs: null, live: false, error: "boom" })).toBe("error");
  });
});
