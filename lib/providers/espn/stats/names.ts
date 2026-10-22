/**
 * Play text names players the short way ("J.Meyers"), and a few plays only
 * mention someone in the text, without listing them as a participant with a
 * useful role:
 *   - the intended receiver on an interception ("intended for J.Meyers"),
 *     who still gets a target in the official stats;
 *   - a player who takes a lateral ("Lateral to R.Johnson"), who gets the
 *     yards after the lateral.
 * To find their ids, we learn each name from other plays in the same game
 * where the text and the participant roles line up one-to-one.
 */
import type { Play } from "@/lib/providers/types";
import { afterReplayReversal, NAME, splitTry } from "./play-text";

/** Short name ("J.Meyers") -> ESPN athlete id, for one game. */
export type NameIndex = ReadonlyMap<string, string>;

// Where each role's name sits in the text.
const PASSER = new RegExp(String.raw`(${NAME}) (?:pass|sacked|spiked)\b`);
const RECEIVER = new RegExp(String.raw`\bpass\b[^.]*? to (${NAME})`);
const RUSHER = new RegExp(
  String.raw`(${NAME}) (?:up the middle|(?:left|right) (?:end|tackle|guard)|scrambles|kneels|FUMBLES|Aborted|to [A-Z]{2,3} \d|to 50|for |pushed ob|ran ob)`,
);
// "B.Fisher reported in as eligible." comes before the real action; skip it.
const REPORTED_ELIGIBLE = new RegExp(String.raw`${NAME} reported in as eligible\.\s*`, "g");

/** Builds the name index from a game's plays. Names that point at two players are dropped. */
export function buildNameIndex(plays: readonly Play[]): NameIndex {
  const found = new Map<string, string | null>(); // null = ambiguous

  const learn = (name: string | undefined, ids: string[]) => {
    if (!name || ids.length !== 1) return; // only when exactly one player has the role
    const known = found.get(name);
    if (known === undefined) found.set(name, ids[0]);
    else if (known !== ids[0]) found.set(name, null);
  };

  for (const play of plays) {
    const { main } = splitTry(afterReplayReversal(play.text));
    const text = main.replace(REPORTED_ELIGIBLE, "");
    const ids = (role: string) => [
      ...new Set(play.participants.filter((p) => p.role === role).map((p) => p.playerId)),
    ];
    learn(PASSER.exec(text)?.[1], ids("passer"));
    learn(RECEIVER.exec(text)?.[1], ids("receiver"));
    if (ids("passer").length === 0) learn(RUSHER.exec(text)?.[1], ids("rusher"));
  }

  const index = new Map<string, string>();
  for (const [name, id] of found) if (id) index.set(name, id);
  return index;
}
