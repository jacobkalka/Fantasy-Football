/**
 * Fast, forgiving player search for the browser. A drop-in replacement for
 * `searchPlayers` in lib/hooks/usePlayers.ts (same first four arguments).
 *
 * Forgiving about: case, accents ("Penix" / "Pénix"), punctuation ("A.J." = "aj",
 * "Ja'Marr" = "jamarr", "Amon-Ra" = "amon ra" = "amonra"), suffixes ("Jr.", "III"),
 * spacing ("st brown" = "stbrown"), initials ("jj" finds Justin Jefferson), small
 * typos ("mahomse", "mccaffery"), team abbreviations ("KC") and filters typed into
 * the query ("kc wr", "chiefs te", "dst").
 *
 * Ranking: exact name > name starts with it > a name part starts with it >
 * contains it > initials > team > close spelling; ties go to the most-rostered.
 */
import type { Player, Position } from "@/lib/providers/types";

/** Lower-case, no accents, no apostrophes or periods, other punctuation becomes a space. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

const POSITION_WORDS: Record<string, Position> = {
  qb: "QB",
  rb: "RB",
  wr: "WR",
  te: "TE",
  k: "K",
  pk: "K",
  kicker: "K",
  dst: "DST",
  def: "DST",
  defense: "DST",
};

interface NameIndex {
  full: string;
  tokens: string[];
  /** Without Jr./III etc. */
  base: string;
  baseTokens: string[];
  compact: string;
  initials: string;
  /** Everything after the first word. */
  last: string;
  /** Every trailing run of words: "ra st brown", "st brown", "brown". */
  lastNames: string[];
}

const nameIndexes = new WeakMap<Player, NameIndex>();

function indexName(player: Player): NameIndex {
  let index = nameIndexes.get(player);
  if (!index) {
    const full = normalize(player.name);
    const tokens = full.split(" ").filter(Boolean);
    const baseTokens = tokens.filter((t, i) => i === 0 || !SUFFIXES.has(t));
    index = {
      full,
      tokens,
      base: baseTokens.join(" "),
      baseTokens,
      compact: tokens.join(""),
      initials: baseTokens.map((t) => t[0]).join(""),
      last: baseTokens.slice(1).join(" "),
      lastNames: baseTokens.slice(1).map((_, i) => baseTokens.slice(i + 1).join(" ")),
    };
    nameIndexes.set(player, index);
  }
  return index;
}

/** Optimal-string-alignment distance (a swap of two letters counts as one edit), capped for speed. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = row;
  }
  return prev[b.length];
}

/** Each query token is the start of a name token, in order ("pat mah", "a j brown" style queries use compact). */
function prefixesInOrder(query: string[], tokens: string[]): boolean {
  let at = 0;
  for (const q of query) {
    while (at < tokens.length && !tokens[at].startsWith(q)) at++;
    if (at === tokens.length) return false;
    at++;
  }
  return true;
}

/** How well a name matches the query (0 = not at all). */
export function nameScore(player: Player, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const n = indexName(player);
  const qTokens = q.split(" ");
  const qCompact = qTokens.join("");
  if (q === n.full || q === n.base || qCompact === n.compact) return 100;
  // Last name: any trailing part of the name ("st brown" and "brown" for Amon-Ra St. Brown).
  if (n.lastNames.includes(q) || n.lastNames.some((l) => l.replace(/ /g, "") === qCompact)) return 90;
  if (q === n.baseTokens[0]) return 88;
  if (n.full.startsWith(q) || n.compact.startsWith(qCompact)) return 80;
  if (qTokens.length > 1 && prefixesInOrder(qTokens, n.tokens)) return 75;
  if (n.last && (n.last.startsWith(q) || n.last.replace(/ /g, "").startsWith(qCompact))) return 70;
  if (qTokens.every((t) => n.tokens.some((token) => token.startsWith(t)))) return 60;
  if (qCompact.length >= 3 && n.compact.includes(qCompact)) return 40;
  if (qTokens.length === 1 && q.length >= 2 && q.length <= 4 && q === n.initials) return 30;
  // Close spelling: every query word of 4+ letters is within 1 edit (2 for 7+ letters) of a name word.
  const longWords = qTokens.filter((t) => t.length >= 4);
  if (
    longWords.length &&
    longWords.length === qTokens.length &&
    longWords.every((t) => n.baseTokens.some((token) => editDistance(t, token, t.length >= 7 ? 2 : 1) <= (t.length >= 7 ? 2 : 1)))
  ) {
    return 10;
  }
  return 0;
}

export interface SearchOptions {
  /** Only this position ("ALL" or undefined = every position). */
  position?: Position | "ALL";
  /** Extra words a team answers to (nickname, city), e.g. ["chiefs", "kansas city"]. */
  teamNames?: (teamId: string | null) => string[];
}

function bySearchOrder(a: { player: Player; score: number }, b: { player: Player; score: number }) {
  return b.score - a.score || (b.player.percentOwned ?? 0) - (a.player.percentOwned ?? 0) || a.player.name.localeCompare(b.player.name);
}

/**
 * Ranked search. `players` is the full list (most-rostered first, as /api/players
 * returns it); `teamAbbr` turns a team id into "KC".
 */
export function searchPlayers(
  players: Player[],
  query: string,
  teamAbbr: (teamId: string | null) => string | null,
  limit = 40,
  options: SearchOptions = {},
): Player[] {
  const wanted = options.position && options.position !== "ALL" ? options.position : null;
  const pool = wanted ? players.filter((p) => p.position === wanted) : players;
  const q = normalize(query).replace(/\bd st\b/g, "dst");
  if (!q) return pool.slice(0, limit);

  const abbrOf = (p: Player) => teamAbbr(p.teamId)?.toLowerCase() ?? null;
  const teamWords = (p: Player) => [abbrOf(p), ...(options.teamNames?.(p.teamId) ?? []).map(normalize)].filter((w): w is string => Boolean(w));
  const tokens = q.split(" ");

  // "kc wr", "chiefs te", "wr brown": words that are a position or a team act as filters.
  // Filtered matches come first; plain name matches follow ("jax smith" also finds Jaxon Smith-Njigba).
  let filteredFirst: Player[] = [];
  if (tokens.length > 1) {
    const allTeamWords = new Set(pool.flatMap(teamWords));
    const positionFilter = tokens.map((t) => POSITION_WORDS[t]).find(Boolean);
    const teamFilter = tokens.find((t) => allTeamWords.has(t));
    const rest = tokens.filter((t) => !POSITION_WORDS[t] && t !== teamFilter).join(" ");
    if (positionFilter || teamFilter) {
      const filtered = pool.filter(
        (p) => (!positionFilter || p.position === positionFilter) && (!teamFilter || teamWords(p).includes(teamFilter)),
      );
      const results = rest
        ? filtered
            .map((player) => ({ player, score: nameScore(player, rest) }))
            .filter((r) => r.score > 0)
            .sort(bySearchOrder)
            .map((r) => r.player)
        : filtered;
      filteredFirst = results.slice(0, limit);
      if (!rest) return filteredFirst;
    }
  }

  const scored: { player: Player; score: number }[] = [];
  for (const player of pool) {
    let score = nameScore(player, q);
    if (score < 20 && teamWords(player).includes(q)) score = 20;
    if (score > 0) scored.push({ player, score });
  }
  // A lone position word ("wr", "dst") that matches no name lists that position.
  if (!scored.some((r) => r.score >= 30) && POSITION_WORDS[q]) {
    return pool.filter((p) => p.position === POSITION_WORDS[q]).slice(0, limit);
  }
  const seen = new Set(filteredFirst.map((p) => p.id));
  const rest = scored.sort(bySearchOrder).map((r) => r.player).filter((p) => !seen.has(p.id));
  return [...filteredFirst, ...rest].slice(0, limit);
}
