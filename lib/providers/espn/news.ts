import type { Injury, NewsItem } from "@/lib/providers/types";
import { arr, get, num, obj, str, type Json } from "./json";

export function parseNews(raw: Json): NewsItem[] {
  return arr(get(raw, "articles"))
    .map(obj)
    .map((a) => ({
      id: str(a.id) || str(a.nowId) || str(a.headline),
      headline: str(a.headline),
      description: str(a.description),
      published: str(a.published) || str(a.lastModified),
      link: str(get(a, "links", "web", "href")) || undefined,
      playerIds: arr(a.categories)
        .map(obj)
        .filter((c) => str(c.type) === "athlete" && c.athleteId !== undefined)
        .map((c) => String(num(c.athleteId))),
    }))
    .filter((n) => n.headline);
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ESPN's fantasy news feed for one player. (The general news endpoint ignores its
 * `athlete` filter, so it can't be used for per-player news.) "Rotowire" items are
 * short player updates; their `story` is the useful part.
 */
export function parsePlayerNews(raw: Json, playerId: string): NewsItem[] {
  return arr(get(raw, "feed"))
    .map(obj)
    .map((a) => {
      const rotowire = str(a.type) === "Rotowire";
      return {
        id: str(a.id) || str(a.nowId) || str(a.headline),
        headline: str(a.headline),
        description: rotowire ? stripHtml(str(a.story)) || str(a.description) : str(a.description),
        published: str(a.published) || str(a.lastModified),
        link: str(get(a, "links", "web", "href")) || undefined,
        playerIds: [playerId],
      };
    })
    .filter((n) => n.headline);
}

/** The league-wide injury report. Athlete ids only appear inside their profile links. */
export function parseInjuries(raw: Json): Injury[] {
  const injuries: Injury[] = [];
  for (const team of arr(get(raw, "injuries")).map(obj)) {
    const teamId = str(team.id);
    for (const item of arr(team.injuries).map(obj)) {
      const href = arr(get(item, "athlete", "links"))
        .map((l) => str(get(l, "href")))
        .find((h) => /\/id\/\d+/.test(h));
      const playerId = href?.match(/\/id\/(\d+)/)?.[1];
      if (!playerId) continue;
      injuries.push({
        playerId,
        teamId,
        status: str(item.status),
        shortComment: str(item.shortComment),
        longComment: str(item.longComment) || undefined,
        date: str(item.date),
      });
    }
  }
  return injuries;
}
