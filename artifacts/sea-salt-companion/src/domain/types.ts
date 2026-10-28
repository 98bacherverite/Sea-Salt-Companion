export type ExtensionId = "extraSalt" | "extraPepper";
export type GameStatus = "inProgress" | "finished";
export type RoundStatus = "inProgress" | "completed" | "cancelled";
export type EndType = "stop" | "lastChance";
export type CardZone = "hand" | "played";

export interface Player {
  id: string;
  name: string;
  createdAt?: string;
}

export interface CardCount {
  cardId: string;
  quantity: number;
  zone: CardZone;
}

export interface PlayerScoreInput {
  playerId: string;
  cards: CardCount[];
  /** Counts by printed card color, entered only when the user can verify them. */
  colorCounts?: Record<string, number>;
  /** Number of hand cards that each seahorse substitutes in that collection. */
  seahorseAssignments?: Partial<
    Record<"shell" | "octopus" | "penguin" | "cabin-boy", number>
  >;
  /** Number of stars explicitly played as part of a duo trio. */
  starfishTrioCount?: number;
  /** Number of face-down shells protecting this player; they score no points. */
  faceDownShellCount?: number;
}

export interface ScoreLine {
  id: string;
  label: string;
  quantity: number;
  points: number | null;
  explanation: string;
  source: string;
  verified: boolean;
}

export interface ScoreResult {
  total: number | null;
  lines: ScoreLine[];
  warnings: string[];
  canConfirm: boolean;
  cardPoints: number | null;
  colorBonus: number | null;
}

export interface Round {
  id: string;
  index: number;
  status: RoundStatus;
  endType?: EndType;
  scores: Record<string, number>;
  entries: Record<string, CardCount[]>;
  colorCounts?: Record<string, Record<string, number>>;
  seahorseAssignments?: Record<
    string,
    Partial<Record<"shell" | "octopus" | "penguin" | "cabin-boy", number>>
  >;
  starfishTrioCounts?: Record<string, number>;
  faceDownShellCounts?: Record<string, number>;
  activeExtensions?: ExtensionId[];
  pepperEventId?: string | null;
  /** Snapshot of each player's owned Pepper event at the start of this round. */
  ownedPepperEvents?: Record<string, string | null>;
  pepperOwnershipDirections?: Record<string, "highest" | "lowest" | "needsVerification">;
  endedByPlayerId?: string;
  endedAt?: string;
  cancellationReason?: "deckEmpty" | "userCancelled";
}

export interface ExtensionChange {
  extensionId: ExtensionId;
  enabled: boolean;
  requestedAt: string;
  effectiveRoundIndex: number;
  status: "scheduled" | "applied";
}

export interface Game {
  id: string;
  status: GameStatus;
  playerIds: string[];
  players: Player[];
  extensions: ExtensionId[];
  rounds: Round[];
  createdAt: string;
  updatedAt: string;
  totalScores?: Record<string, number>;
  scheduledExtensions?: ExtensionId[];
  winnerPlayerIds?: string[];
  ownedPepperEvents?: Record<string, string | null>;
  pepperDeck?: string[];
  pepperDiscard?: string[];
  extensionChanges?: ExtensionChange[];
  extensionAudit?: Array<{
    extensionId: ExtensionId;
    enabled: boolean;
    requestedAt: string;
    effectiveRoundIndex: number;
    status: "scheduled" | "applied";
  }>;
  houseRuleChanges?: boolean;
}

export interface AppState {
  schemaVersion: 1;
  players: Player[];
  games: Game[];
  currentGameId: string | null;
}

export interface SimulationResult {
  endType: EndType;
  roundScores: Record<string, number>;
  scoreResults: Record<string, ScoreResult>;
  warnings: string[];
  canConfirm: boolean;
  winnerPlayerIds: string[];
  gameFinished: boolean;
  threshold: number;
}
