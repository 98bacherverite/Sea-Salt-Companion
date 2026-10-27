import { useEffect, useMemo, useState } from "react";
import App, { type Game as UiGame, type SeaSaltCompanionAdapter } from "./App";
import { PEPPER_EVENTS } from "@/domain/catalog";
import {
  calculatePotentialScore,
  simulateRoundEnd,
  type ScoringRules,
} from "@/domain/scoring";
import { loadAppState, saveAppState } from "@/domain/storage";
import type {
  AppState,
  CardCount,
  EndType,
  Game,
  Player,
  PlayerScoreInput,
  Round,
} from "@/domain/types";

const EMPTY_STATE: AppState = {
  schemaVersion: 1,
  players: [],
  games: [],
  currentGameId: null,
};

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("fr");
}

function calculateCumulativeScores(game: Game, beforeRoundIndex?: number) {
  const totals: Record<string, number> = Object.fromEntries(
    game.players.map((player) => [player.id, 0]),
  );
  for (const round of game.rounds) {
    if (
      round.status !== "completed" ||
      (beforeRoundIndex !== undefined && round.index >= beforeRoundIndex)
    ) {
      continue;
    }
    for (const player of game.players) {
      totals[player.id] += round.scores[player.id] ?? 0;
    }
  }
  return totals;
}

function getRoundInputs(round: Round, players: Player[]): PlayerScoreInput[] {
  return players.map((player) => ({
    playerId: player.id,
    cards: round.entries[player.id] ?? [],
    colorCounts: round.colorCounts?.[player.id],
    starfishTrioCount: round.starfishTrioCounts?.[player.id] ?? 0,
    faceDownShellCount: round.faceDownShellCounts?.[player.id] ?? 0,
  }));
}

function rulesFor(game: Game, round: Round, enderId?: string): ScoringRules {
  return {
    playerCount: game.players.length as 2 | 3 | 4,
    extensions: round.activeExtensions ?? game.extensions,
    pepperEventId: round.pepperEventId ?? null,
    ownedPepperEvents: round.ownedPepperEvents ?? game.ownedPepperEvents,
    roundEnderPlayerId: enderId,
  };
}

function freshPepperDeck(): string[] {
  const ids = PEPPER_EVENTS.map((event) => event.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[other]] = [ids[other], ids[index]];
  }
  return ids;
}

function roundForGame(game: Game, roundId: string): Round | undefined {
  return game.rounds.find((round) => round.id === roundId);
}

function inputForGame(game: Game, round: Round): PlayerScoreInput[] {
  return getRoundInputs(round, game.players);
}

function withPotentialScores(game: Game, round: Round): Round {
  const scores: Record<string, number> = {};
  for (const player of game.players) {
    const result = calculatePotentialScore(
      {
        playerId: player.id,
        cards: round.entries[player.id] ?? [],
        colorCounts: round.colorCounts?.[player.id],
        starfishTrioCount: round.starfishTrioCounts?.[player.id] ?? 0,
        faceDownShellCount: round.faceDownShellCounts?.[player.id] ?? 0,
      },
      rulesFor(game, round),
    );
    if (result.total !== null) scores[player.id] = result.total;
  }
  return { ...round, scores };
}

export default function AppContainer() {
  const [state, setState] = useState<AppState | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [endPreview, setEndPreview] = useState<SeaSaltCompanionAdapter["endPreview"]>();

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const applyPreference = () => {
      document.documentElement.classList.toggle("dark", preference.matches);
    };
    applyPreference();
    preference.addEventListener("change", applyPreference);
    return () => preference.removeEventListener("change", applyPreference);
  }, []);

  useEffect(() => {
    let active = true;
    void loadAppState()
      .then((stored) => {
        if (active) setState(stored);
      })
      .catch((error: unknown) => {
        if (active) {
          setStorageError(
            error instanceof Error
              ? error.message
              : "Impossible de lire les données locales.",
          );
          setState(structuredClone(EMPTY_STATE));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const commit = (next: AppState) => {
    setState(next);
    setStorageError(null);
    void saveAppState(next).catch((error: unknown) => {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Impossible d’enregistrer les données locales.",
      );
    });
  };

  const updateGame = (
    gameId: string,
    update: (game: Game) => Game,
  ): Game | undefined => {
    if (!state) return undefined;
    const current = state.games.find((game) => game.id === gameId);
    if (!current) return undefined;
    const updated = { ...update(current), updatedAt: new Date().toISOString() };
    commit({
      ...state,
      games: state.games.map((game) => (game.id === gameId ? updated : game)),
    });
    return updated;
  };

  const adapter: SeaSaltCompanionAdapter | undefined = useMemo(() => {
    if (!state) return undefined;
    const games = [...state.games]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) as UiGame[];

    return {
      games,
      endPreview,
      onCreateGame: (uiGame) => {
        const now = new Date().toISOString();
        const players = uiGame.players.map((incoming) => {
          const matching = state.players.find(
            (known) => normalizedName(known.name) === normalizedName(incoming.name),
          );
          return matching
            ? { ...matching, name: incoming.name.trim() || matching.name }
            : { ...incoming, name: incoming.name.trim() || "Joueur", createdAt: now };
        });
        const game: Game = {
          ...(uiGame as Game),
          players,
          playerIds: players.map((player) => player.id),
          extensions: [...uiGame.extensions],
          createdAt: now,
          updatedAt: now,
          totalScores: Object.fromEntries(players.map((player) => [player.id, 0])),
          scheduledExtensions: [],
          pepperDeck: uiGame.extensions.includes("extraPepper")
            ? freshPepperDeck()
            : [],
          pepperDiscard: [],
          ownedPepperEvents: Object.fromEntries(
            players.map((player) => [player.id, null]),
          ),
          rounds: uiGame.rounds.map((round, index) => ({
            ...(round as Round),
            index: index + 1,
            activeExtensions: [...uiGame.extensions],
            pepperEventId: null,
            ownedPepperEvents: Object.fromEntries(
              players.map((player) => [player.id, null]),
            ),
          })),
        };
        const profiles = players.reduce<Player[]>((result, player) => {
          if (!result.some((existing) => existing.id === player.id)) {
            result.push(player);
          }
          return result;
        }, [...state.players]);
        commit({
          ...state,
          players: profiles,
          games: [game, ...state.games.filter((item) => item.id !== game.id)],
          currentGameId: game.id,
        });
        setEndPreview(undefined);
      },
      onResumeGame: (gameId) => {
        commit({ ...state, currentGameId: gameId });
        setEndPreview(undefined);
      },
      onUpdateEntries: (gameId, roundId, playerId, entries) => {
        updateGame(gameId, (game) => {
          const round = roundForGame(game, roundId);
          if (!round || round.status !== "inProgress") return game;
          const nextRound: Round = {
            ...round,
            entries: { ...round.entries, [playerId]: entries },
          };
          const scoredRound = withPotentialScores(game, nextRound);
          return {
            ...game,
            rounds: game.rounds.map((item) =>
              item.id === roundId
                ? scoredRound
                : item,
            ),
          };
        });
      },
      onUpdateColorCounts: (gameId, roundId, playerId, counts) => {
        updateGame(gameId, (game) => ({
          ...game,
          rounds: game.rounds.map((round) => {
            if (round.id !== roundId) return round;
            return withPotentialScores(game, {
              ...round,
              colorCounts: { ...round.colorCounts, [playerId]: counts },
            });
          }),
        }));
      },
      onSetPepperEvent: (gameId, roundId, eventId) => {
        updateGame(gameId, (game) => ({
          ...game,
          rounds: game.rounds.map((round) =>
            round.id === roundId
              ? withPotentialScores(game, { ...round, pepperEventId: eventId })
              : round,
          ),
        }));
        setEndPreview(undefined);
      },
      onRequestEndRound: (gameId, roundId, endType, enderPlayerId) => {
        const game = state.games.find((item) => item.id === gameId);
        const round = game && roundForGame(game, roundId);
        if (!game || !round) return;
        const simulation = simulateRoundEnd(
          inputForGame(game, round),
          rulesFor(game, round, enderPlayerId),
          endType,
          calculateCumulativeScores(game, round.index),
        );
        const details = Object.fromEntries(
          Object.entries(simulation.scoreResults).map(([playerId, result]) => [
            playerId,
            result.lines.map(
              (line) =>
                `${line.label}: ${line.points === null ? "à vérifier" : `${line.points} pt${line.points > 1 ? "s" : ""}`}`,
            ),
          ]),
        );
        setEndPreview({
          gameId,
          roundId,
          endType,
          scores: simulation.roundScores,
          warnings: [...simulation.warnings],
          canConfirm: simulation.canConfirm,
          details,
        });
      },
      onConfirmEndRound: (gameId, roundId, endType, enderPlayerId) => {
        const current = state.games.find((game) => game.id === gameId);
        const currentRound = current && roundForGame(current, roundId);
        if (!current || !currentRound || !enderPlayerId) return;
        const simulation = simulateRoundEnd(
          inputForGame(current, currentRound),
          rulesFor(current, currentRound, enderPlayerId),
          endType,
          calculateCumulativeScores(current, currentRound.index),
        );
        if (!simulation.canConfirm) return;

        const completed: Round = {
          ...currentRound,
          status: "completed",
          endType,
          endedByPlayerId: enderPlayerId,
          endedAt: new Date().toISOString(),
          scores: simulation.roundScores,
        };
        const totalScores = calculateCumulativeScores(current);
        for (const player of current.players) {
          totalScores[player.id] =
            (totalScores[player.id] ?? 0) +
            (simulation.roundScores[player.id] ?? 0);
        }
        const gameFinished = simulation.gameFinished;
        const currentExtensions = new Set(current.extensions);
        for (const extension of current.scheduledExtensions ?? []) {
          currentExtensions.add(extension);
        }
        const nextIndex = currentRound.index + 1;
        const extensionChanges = (current.extensionChanges ?? []).map((change) =>
          change.effectiveRoundIndex === nextIndex
            ? { ...change, status: "applied" as const }
            : change,
        );
        const nextRound: Round | undefined = gameFinished
          ? undefined
          : {
              id: newId(),
              index: nextIndex,
              status: "inProgress",
              scores: {},
              entries: {},
              activeExtensions: [...currentExtensions],
              pepperEventId: null,
              ownedPepperEvents: { ...current.ownedPepperEvents },
            };
        const nextGame: Game = {
          ...current,
          status: gameFinished ? "finished" : "inProgress",
          extensions: [...currentExtensions],
          scheduledExtensions: [],
          totalScores,
          winnerPlayerIds: simulation.winnerPlayerIds,
          extensionChanges,
          rounds: [
            ...current.rounds.map((round) =>
              round.id === roundId ? completed : round,
            ),
            ...(nextRound ? [nextRound] : []),
          ],
          updatedAt: new Date().toISOString(),
        };
        if (nextGame.extensions.includes("extraPepper") && nextRound) {
          nextGame.pepperDeck = current.pepperDeck ?? freshPepperDeck();
        }
        commit({
          ...state,
          games: state.games.map((game) =>
            game.id === gameId ? nextGame : game,
          ),
          currentGameId: gameFinished ? null : gameId,
        });
        setEndPreview(undefined);
      },
      onScheduleExtension: (gameId, extension) => {
        updateGame(gameId, (game) => {
          const scheduled = new Set(game.scheduledExtensions ?? []);
          scheduled.add(extension);
          const requestedAt = new Date().toISOString();
          const nextRoundIndex =
            (game.rounds.find((round) => round.status === "inProgress")?.index ??
              game.rounds.length) + 1;
          const changes = (game.extensionChanges ?? []).filter(
            (change) =>
              !(
                change.extensionId === extension &&
                change.status === "scheduled"
              ),
          );
          changes.push({
            extensionId: extension,
            enabled: true,
            requestedAt,
            effectiveRoundIndex: nextRoundIndex,
            status: "scheduled",
          });
          return {
            ...game,
            scheduledExtensions: [...scheduled],
            extensionChanges: changes,
            houseRuleChanges: true,
          };
        });
      },
      onCancelScheduledExtension: (gameId, extension) => {
        updateGame(gameId, (game) => ({
          ...game,
          scheduledExtensions: (game.scheduledExtensions ?? []).filter(
            (item) => item !== extension,
          ),
          extensionChanges: (game.extensionChanges ?? []).filter(
            (change) =>
              !(
                change.extensionId === extension &&
                change.status === "scheduled"
              ),
          ),
        }));
      },
    };
  }, [state, endPreview]);

  if (!state || !adapter) {
    return (
      <main className="page" role="status">
        <div className="empty-box">
          {storageError ?? "Ouverture de votre table…"}
        </div>
      </main>
    );
  }

  return <App adapter={adapter} />;
}
