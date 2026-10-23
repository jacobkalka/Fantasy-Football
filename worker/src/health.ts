/**
 * A tiny web page Railway can check: GET /health answers with when the worker
 * last heard from ESPN, when it last wrote to the database, and which games it
 * is following. 200 = fine, 503 = no successful ESPN fetch for too long.
 */
import { createServer, type Server } from "node:http";
import type { HealthSnapshot } from "./worker";

/** A fresh worker gets this long to make its first successful fetch. */
const STARTUP_GRACE_MS = 2 * 60_000;

export function healthResponse(
  snapshot: HealthSnapshot,
  intervalMs: number,
  now: number,
): { status: number; body: HealthSnapshot & { ok: boolean; state: "starting" | "ok" | "stale" } } {
  // Stale = three missed polls in a row (at least 2 minutes' worth).
  const staleAfter = Math.max(3 * intervalMs, 2 * 60_000);
  const last = snapshot.lastEspnFetchAt ? Date.parse(snapshot.lastEspnFetchAt) : null;
  const sinceStart = now - Date.parse(snapshot.startedAt);
  let state: "starting" | "ok" | "stale";
  if (last === null) state = sinceStart < STARTUP_GRACE_MS ? "starting" : "stale";
  else state = now - last <= staleAfter ? "ok" : "stale";
  return { status: state === "stale" ? 503 : 200, body: { ok: state !== "stale", state, ...snapshot } };
}

export function startHealthServer(
  port: number,
  read: () => { status: number; body: unknown },
  onListening: (port: number) => void,
): Server {
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    if (path === "/health") {
      const { status, body } = read();
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(body, null, 2));
      return;
    }
    if (path === "/") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("FantasyLab live-data worker. Status: /health\n");
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(port, () => onListening(port));
  return server;
}
