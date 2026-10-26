import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseArticles, parsePlayerArticles } from "./news";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}`, "utf8"));

describe("news articles (real ESPN feeds)", () => {
  const articles = parseArticles(sample("news-league-week7.json"));

  it("reads cards with headline, time, ESPN link, image and source", () => {
    expect(articles.length).toBeGreaterThan(10);
    for (const a of articles) {
      expect(a.headline).not.toBe("");
      expect(Date.parse(a.published)).not.toBeNaN();
      if (a.link) expect(a.link).toMatch(/^https:\/\/(www\.)?espn\.com\//);
      if (a.image) expect(a.image).toMatch(/^https:\/\/a\.espncdn\.com\//);
    }
    expect(articles.some((a) => a.source !== "ESPN")).toBe(true);
  });

  it("keeps the players and teams each story is tagged with, with names", () => {
    const tagged = articles.find((a) => a.playerIds.length > 0)!;
    expect(tagged.playerNames[tagged.playerIds[0]]).toBeTruthy();
    expect(articles.some((a) => a.teamIds.length > 0)).toBe(true);
  });

  it("labels injury stories from their headline", () => {
    const injury = articles.find((a) => /injur|sprain|day-to-day/i.test(a.headline));
    if (injury) expect(injury.category).toBe("Injury");
  });

  it("turns a player's fantasy feed into cards, crediting player updates", () => {
    const cards = parsePlayerArticles(sample("fantasy-news-player-3139477.json"), "3139477");
    const update = cards.find((c) => c.category === "Player update")!;
    expect(update.source).toBe("RotoWire via ESPN");
    expect(update.link).toBe("https://www.espn.com/nfl/player/_/id/3139477");
    expect(cards.every((c) => c.playerIds[0] === "3139477")).toBe(true);
  });
});
