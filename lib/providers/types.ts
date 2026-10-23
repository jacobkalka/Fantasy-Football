/**
 * The app's own shapes for football data. Every data provider (ESPN today)
 * translates its responses into these, and the rest of the app only uses these.
 */
import type { StatLine } from "@/lib/stats";

export type GameState = "pre" | "in" | "post";

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export interface Team {
  /** ESPN team id, e.g. "12" for Kansas City. */
  id: string;
  abbr: string;
  /** "Chiefs" */
  name: string;
  /** "Kansas City Chiefs" */
  displayName: string;
  /** "#e31837" */
  color: string;
  altColor: string;
  /** Logo drawn for dark backgrounds. */
  logo: string;
}

export interface GameSide {
  team: Team;
  score: number;
  /** "4-2" */
  record?: string;
  /** Points per quarter (overtime is a fifth entry). */
  linescores: number[];
}

export interface GameSituation {
  possessionTeamId?: string;
  /** "3rd & 7 at KC 35" */
  downDistance?: string;
  isRedZone: boolean;
  lastPlayText?: string;
}

export interface Game {
  /** ESPN event id. */
  id: string;
  season: number;
  /** 1 preseason, 2 regular season, 3 postseason. */
  seasonType: number;
  week: number;
  /** ISO time. */
  kickoff: string;
  state: GameState;
  completed: boolean;
  /** "Final/OT", "Q3 4:12", "Thu 8:15 PM": ready to display. */
  statusText: string;
  period: number;
  clock: string;
  home: GameSide;
  away: GameSide;
  situation?: GameSituation;
  odds?: { details?: string; spread?: number; overUnder?: number };
  weather?: { text: string; temperature?: number };
  venue?: { name: string; city?: string; indoor: boolean };
  broadcast?: string;
}

/** Someone involved in a play, and how ("passer", "receiver", "rusher", "scorer", "fumbler"...). */
export interface PlayParticipant {
  playerId: string;
  role: string;
}

export interface Play {
  /** ESPN play id; stable across corrections, so it's the de-duplication key. */
  id: string;
  gameId: string;
  /** Order within the game. */
  sequence: number;
  period: number;
  clock: string;
  /** "Pass Reception", "Rush", "Passing Touchdown"... */
  type: string;
  text: string;
  /** Team with the ball. */
  teamId?: string;
  yards: number;
  scoring: boolean;
  scoreValue: number;
  awayScore: number;
  homeScore: number;
  isPenalty: boolean;
  isTurnover: boolean;
  participants: PlayParticipant[];
  /** Real-world time the play happened (ISO), when known. */
  wallclock?: string;
  /** Last time ESPN changed this play (ISO). */
  modified?: string;
}

/** What one play changed for one player. */
export interface PlayerStatDelta {
  playerId: string;
  stats: StatLine;
}

export interface AttributedPlay extends Play {
  deltas: PlayerStatDelta[];
}

export interface Drive {
  id: string;
  teamId: string;
  /** "8 plays, 75 yards, 4:12" */
  description: string;
  /** "Touchdown", "Punt", "Field Goal"... */
  result: string;
  isScore: boolean;
  yards: number;
  playIds: string[];
  startPeriod: number;
  startClock: string;
}

/** One player's official box-score line for a game. */
export interface PlayerGameLine {
  playerId: string;
  name: string;
  teamId: string;
  stats: StatLine;
}

export interface TeamStat {
  name: string;
  label: string;
  away: string;
  home: string;
}

export interface WinProbabilityPoint {
  playId: string;
  homeWinPct: number;
}

export interface GameDetail {
  game: Game;
  drives: Drive[];
  /** Oldest first. */
  plays: AttributedPlay[];
  /** Official totals, keyed by player id. */
  boxscore: Record<string, PlayerGameLine>;
  teamStats: TeamStat[];
  winProbability: WinProbabilityPoint[];
}

export type InjuryStatus =
  | "ACTIVE"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "INJURY_RESERVE"
  | "SUSPENSION"
  | "DAY_TO_DAY"
  | "UNKNOWN";

export interface Player {
  /** ESPN athlete id (D/ST units use ESPN fantasy's negative ids, e.g. "-16012"). */
  id: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  injuryStatus?: InjuryStatus;
  percentOwned?: number;
}

export interface PlayerWeek {
  week: number;
  gameId?: string;
  stats: StatLine;
}

/** Projections and recent results from the fantasy feed. */
export interface PlayerOutlook {
  playerId: string;
  injuryStatus: InjuryStatus;
  /** Projected stat line for the requested week, if ESPN has one. */
  projection: StatLine | null;
  /** Actual stat lines for completed weeks this season, oldest first. */
  weeks: PlayerWeek[];
  seasonProjection: StatLine | null;
  outlook?: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  description: string;
  published: string;
  link?: string;
  playerIds: string[];
}

export interface Injury {
  playerId: string;
  teamId: string;
  status: string;
  /** One-line update. */
  shortComment: string;
  longComment?: string;
  date: string;
}

export interface Scoreboard {
  season: number;
  seasonType: number;
  week: number;
  games: Game[];
}

/** The positions a defense is graded against (kickers and D/ST aren't). */
export type OffensePosition = "QB" | "RB" | "WR" | "TE";

/** Everything opposing players at one position did against one defense this season. */
export interface DefenseAllowed {
  /** Games this defense has played so far (byes don't count). */
  games: number;
  /** Season totals for every opposing player at this position, added together. */
  stats: StatLine;
}

/**
 * "Defense vs. position": what each NFL defense has given up to QBs, RBs, WRs and TEs.
 * The provider only adds up stats; turning them into points and ranks happens in app code,
 * so each scoring format can be ranked separately.
 */
export interface DefenseVsPosition {
  season: number;
  /** Last week included. Only finished weeks count; 0 means no games yet. */
  throughWeek: number;
  /** Team id → position → what that defense allowed. */
  teams: Record<string, Partial<Record<OffensePosition, DefenseAllowed>>>;
}

/** One week of a player's real results in the analysis universe. */
export interface UniverseWeek {
  week: number;
  /** False when his team played but he didn't (injured, inactive, benched for the whole game). */
  played: boolean;
  stats: StatLine;
}

/**
 * One player in the analysis universe (team ratings, trades, pickups): who he is, how the
 * fantasy market sees him, his projections and his real results this season.
 */
export interface UniversePlayer {
  id: string;
  name: string;
  position: Position;
  teamId: string | null;
  headshot: string | null;
  injuryStatus: InjuryStatus;
  byeWeek: number | null;
  /** % of ESPN leagues that roster him (0-100), null if the source doesn't say. */
  percentOwned: number | null;
  /** The source's recent change in % rostered, in percentage points (ESPN's "+/-"). */
  percentOwnedChange: number | null;
  /** % of ESPN leagues that start him this week. */
  percentStarted: number | null;
  /** Projected stat line for the universe's week; null when the source has none. */
  weekProjection: StatLine | null;
  /** Each week his team has played so far this season (including the current week once it starts). */
  weeks: UniverseWeek[];
  /**
   * Projected stats for the rest of the season, starting with the universe's week, and how many
   * games that covers (can be fractional: the source discounts players expected to miss time).
   * Null when the source has no rest-of-season projection for him.
   */
  restOfSeason: { stats: StatLine; games: number } | null;
  /** Games his NFL team has left, counting the universe's week. Null without a team. */
  teamGamesLeft: number | null;
}

/** Every fantasy-relevant player with projections and results, for one week of the season. */
export interface PlayerUniverse {
  season: number;
  /** The fantasy week the projections are for. */
  week: number;
  players: UniversePlayer[];
}

// ---------------------------------------------------------------------------
// Player research (profile pages). Anything the source doesn't publish is null,
// never guessed. See lib/players/ for what the app derives from these.
// ---------------------------------------------------------------------------

export type GameResult = "W" | "L" | "T";

/** One entry of a player's injury report. */
export interface PlayerInjury {
  /** "Injured Reserve", "Questionable", "Out"... */
  status: string;
  /** Body part ("Hamstring"), when given. */
  type: string | null;
  /** "Left" / "Right", when given. */
  side: string | null;
  /** "Surgery", "Strain"..., when given. */
  detail: string | null;
  /** The source's estimated return date (ISO), when given. */
  returnDate: string | null;
  shortComment: string;
  longComment: string | null;
  /** When the report was written (ISO). */
  date: string;
}

/** A headline stat with its league rank ("1,309 passing yards, 17th"). */
export interface PlayerStatRank {
  /** Source's stat name, e.g. "passingYards". */
  stat: string;
  /** "Passing Yards" */
  label: string;
  value: number;
  /** "1,309" */
  display: string;
  rank: number | null;
  /** "17th", "Tied-13th" */
  rankDisplay: string | null;
}

/** Who a player is. */
export interface PlayerBio {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  /** The source's own position abbreviation ("QB", "PK"...). */
  sourcePosition: string;
  /** Fantasy position, when he plays one. */
  position: Position | null;
  /** null for free agents. */
  teamId: string | null;
  teamAbbr: string | null;
  jersey: string | null;
  headshot: string | null;
  age: number | null;
  /** "1995-09-17" */
  birthDate: string | null;
  /** "Whitehouse, TX" */
  birthPlace: string | null;
  heightInches: number | null;
  weightLbs: number | null;
  /** Which NFL season this is for him: 1 = rookie, 10 = tenth season. */
  nflSeason: number | null;
  college: string | null;
  /** null when the source lists no draft (usually an undrafted player). */
  draft: { year: number; round: number; pick: number; teamId: string | null } | null;
  /** Roster status: "Active", "Free Agent", "Day-To-Day"... */
  status: string | null;
  /** Newest first. */
  injuries: PlayerInjury[];
  /** League ranks for a few headline stats, and the season they're for. */
  seasonRanks: { season: number | null; stats: PlayerStatRank[] } | null;
}

/** One season of a player's career (regular season, all teams added up). */
export interface CareerSeason {
  season: number;
  /** Team abbreviations he played for that season, in order. */
  teams: string[];
  gamesPlayed: number;
  /** Everything the season table gives that maps exactly onto the app's stat names. */
  stats: StatLine;
  /** Two-point conversions (the season table doesn't say passing, rushing or receiving). */
  twoPointConversions: number;
  /** Field goals of 50+ yards (the season table doesn't split 50-59 from 60+). */
  fgMade50Plus: number;
  fgMiss50Plus: number;
  /** Longest made field goal (tells whether any 50+ kick was 60+). */
  longFg: number | null;
}

/** Numbers from the box score that the app's stat names don't cover. Missing = not given. */
export interface PlayerGameExtras {
  longPass?: number;
  longRush?: number;
  longRec?: number;
  longFg?: number;
  /** Times sacked (QBs). */
  sacked?: number;
  passerRating?: number;
}

/** One of his team's games this season. */
export interface PlayerGame {
  gameId: string;
  week: number;
  /** Kickoff (ISO), when known. */
  date: string | null;
  /** Team he played for in this game, when known (players get traded). */
  teamId: string | null;
  opponentId: string | null;
  opponentAbbr: string | null;
  home: boolean | null;
  result: GameResult | null;
  teamScore: number | null;
  opponentScore: number | null;
  /** false: his team played but he didn't (injured, inactive...). */
  played: boolean;
  /** His stat line (empty when he didn't play). */
  stats: StatLine;
  /** Where `stats` came from: the fantasy feed (exact fantasy stats) or the box score. */
  statsSource: "fantasy" | "boxscore" | null;
  /** The source's pregame fantasy projection; null when there was none or it projected him not to play. */
  projection: StatLine | null;
  extras: PlayerGameExtras;
}

/**
 * Season-long numbers from player tracking. Each is null when the source doesn't
 * publish it for this player (it reports 0 for "not tracked", so 0 is read as null
 * where a real 0 is impossible).
 */
export interface PlayerAdvancedStats {
  /** Receiving yards gained after the catch. */
  yardsAfterCatch: number | null;
  /** Receiving yards at the catch point (air yards on completed catches). */
  yardsAtCatch: number | null;
  /** Average depth of target, in yards past the line of scrimmage. */
  avgDepthOfTarget: number | null;
  yardsPerRouteRun: number | null;
  receivingFirstDowns: number | null;
  rushingFirstDowns: number | null;
  /** Runs stopped at or behind the line. */
  stuffs: number | null;
  /** QBs: yards his receivers gained after the catch, and at the catch. */
  passingYardsAfterCatch: number | null;
  passingYardsAtCatch: number | null;
  sacked: number | null;
  sackYardsLost: number | null;
  passerRating: number | null;
}

/** Season split totals. null = the source has no such split for him. */
export interface PlayerSplits {
  /** Plays from the opponent's 19-yard line to the goal line. */
  redZone: StatLine | null;
  home: StatLine | null;
  away: StatLine | null;
}

/** Fantasy-specific information about one player. */
export interface PlayerFantasyInfo {
  injuryStatus: InjuryStatus | null;
  percentOwned: number | null;
  percentStarted: number | null;
  /** Analyst write-up for the season (written before it started). */
  seasonOutlook: string | null;
  /** Analyst write-up for this week. */
  weekOutlook: string | null;
  /** This week's projection. */
  projection: StatLine | null;
  seasonProjection: StatLine | null;
  /** Official fantasy season totals (this season and last, when available). */
  seasonTotals: { season: number; gamesPlayed: number; stats: StatLine }[];
}

/** A player's current season, game by game. */
export interface PlayerSeason {
  playerId: string;
  season: number;
  /** His current team (fantasy feed), null for free agents. */
  teamId: string | null;
  /** Finished regular-season games, oldest first (including ones he missed, when known). */
  games: PlayerGame[];
  splits: PlayerSplits;
  advanced: PlayerAdvancedStats;
  fantasy: PlayerFantasyInfo;
}

/** A spot on a team's depth chart. */
export interface DepthChartSpot {
  playerId: string;
  /** "QB", "RB", "WR", "TE", "FB", "PK", "P", "KR", "PR"... */
  position: string;
  /** "WR1", "WR2"... when a position has several starting spots, else the position. */
  spot: string;
  /** 1 = starter, 2 = first backup... */
  depth: number;
}

export interface DepthChart {
  teamId: string;
  /** Offensive formation the chart is drawn for ("3WR 1TE"). */
  formation: string | null;
  spots: DepthChartSpot[];
}

export interface TeamScheduleGame {
  gameId: string;
  week: number;
  /** ISO kickoff. */
  date: string;
  home: boolean;
  opponentId: string;
  opponentAbbr: string;
  state: GameState;
  teamScore: number | null;
  opponentScore: number | null;
  result: GameResult | null;
}

/** One team's regular-season schedule, played and upcoming. */
export interface TeamSchedule {
  teamId: string;
  season: number;
  byeWeek: number | null;
  games: TeamScheduleGame[];
}

/** Everything the app needs from a sports data source. */
export interface DataProvider {
  /** This week's games (the source decides which week is current), or a specific week. */
  getScoreboard(opts?: { season?: number; week?: number }): Promise<Scoreboard>;
  getGameDetail(gameId: string): Promise<GameDetail>;
  getTeams(): Promise<Team[]>;
  /** Every fantasy-relevant player (for search). */
  getPlayers(season: number): Promise<Player[]>;
  getPlayerOutlooks(playerIds: string[], season: number, week: number): Promise<PlayerOutlook[]>;
  /** Team id → bye week. */
  getByeWeeks(season: number): Promise<Record<string, number>>;
  getPlayerNews(playerId: string): Promise<NewsItem[]>;
  getLeagueNews(): Promise<NewsItem[]>;
  getInjuries(): Promise<Injury[]>;
  /** What each defense has allowed to each position, weeks 1 through `throughWeek`. */
  getDefenseVsPosition(season: number, throughWeek: number): Promise<DefenseVsPosition>;
  /**
   * The ~650 most-rostered QBs, RBs, WRs, TEs, kickers and D/STs with this week's projection,
   * rest-of-season projection and week-by-week results (for team ratings, trades and pickups).
   */
  getPlayerUniverse(season: number, week: number): Promise<PlayerUniverse>;
  /** Who a player is. null for team defenses (D/ST), which have no player page. */
  getPlayerBio(playerId: string): Promise<PlayerBio | null>;
  /** Regular-season stats for every season of his career, oldest first. */
  getPlayerCareer(playerId: string): Promise<CareerSeason[]>;
  /** This season game by game, with splits, tracking numbers and fantasy info. */
  getPlayerSeason(playerId: string, season: number, week: number): Promise<PlayerSeason>;
  /** A team's current depth chart (offense and kickers). */
  getDepthChart(teamId: string, season: number): Promise<DepthChart>;
  getTeamSchedule(teamId: string, season: number): Promise<TeamSchedule>;
}
