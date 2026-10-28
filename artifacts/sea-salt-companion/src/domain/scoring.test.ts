import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculatePotentialScore,
  getRoundEndThreshold,
  isStopAllowed,
  simulateRoundEnd,
} from "./scoring.ts";
import type {
  CardCount,
  ExtensionId,
  PlayerScoreInput,
} from "./types.ts";

function cards(
  ...entries: Array<[string, number, "hand" | "played"]>
): CardCount[] {
  return entries.map(([cardId, quantity, zone]) => ({ cardId, quantity, zone }));
}

function player(
  playerId: string,
  entries: CardCount[] = [],
  options: Partial<PlayerScoreInput> = {},
): PlayerScoreInput {
  return { playerId, cards: entries, ...options };
}

function rules(
  options: {
    playerCount?: 2 | 3 | 4;
    extensions?: ExtensionId[];
    pepperEventId?: string | null;
    roundEnderPlayerId?: string;
    ownedPepperEvents?: Record<string, string | null>;
  } = {},
) {
  return {
    playerCount: options.playerCount ?? 2,
    extensions: options.extensions ?? [],
    pepperEventId: options.pepperEventId ?? null,
    roundEnderPlayerId: options.roundEnderPlayerId,
    ownedPepperEvents: options.ownedPepperEvents,
  } as const;
}

function linePoints(result: ReturnType<typeof calculatePotentialScore>, id: string) {
  return result.lines.find((line) => line.id === id)?.points;
}

describe("moteur de score Sea Salt & Paper", () => {
  it("compte les duos même en main", () => {
    const result = calculatePotentialScore(
      player("a", cards(["crab", 2, "hand"])),
      rules(),
    );
    assert.equal(linePoints(result, "duos"), 1);
  });

  it("applique le barème des coquillages", () => {
    const result = calculatePotentialScore(
      player("a", cards(["shell", 3, "hand"])),
      rules(),
    );
    assert.equal(linePoints(result, "shell"), 4);
  });

  it("calcule un multiplicateur par carte cible", () => {
    const result = calculatePotentialScore(
      player("a", cards(["lighthouse", 1, "played"], ["boat", 2, "hand"])),
      rules(),
    );
    assert.equal(linePoints(result, "lighthouse"), 2);
  });

  it("additionne les meilleures couleurs distinctes pour les sirènes", () => {
    const result = calculatePotentialScore(
      player("a", cards(["siren", 2, "hand"]), {
        colorCounts: { bleu: 4, jaune: 3, rose: 2 },
      }),
      rules(),
    );
    assert.equal(linePoints(result, "siren"), 7);
  });

  it("bloque le score automatique si une égalité touche la couleur décisive", () => {
    const result = calculatePotentialScore(
      player("a", cards(["siren", 1, "hand"]), {
        colorCounts: { bleu: 4, jaune: 4 },
      }),
      rules(),
    );
    assert.equal(result.total, null);
    assert.ok(result.warnings.some((warning) => warning.includes("Égalité")));
  });

  it("calcule le bonus couleur en Dernière Chance gagnée", () => {
    const result = simulateRoundEnd(
      [
        player("a", cards(["shell", 5, "hand"]), {
          colorCounts: { bleu: 4, jaune: 1 },
        }),
        player("b", [], { colorCounts: { rouge: 3 } }),
      ],
      { ...rules(), roundEnderPlayerId: "a" },
      "lastChance",
    );
    assert.equal(result.roundScores.a, 12);
    assert.equal(result.roundScores.b, 3);
    assert.equal(result.canConfirm, true);
  });

  it("applique la pénalité du perdant en Dernière Chance", () => {
    const result = simulateRoundEnd(
      [
        player("a", cards(["shell", 5, "hand"]), {
          colorCounts: { bleu: 3 },
        }),
        player("b", cards(["shell", 6, "hand"]), {
          colorCounts: { rouge: 2 },
        }),
      ],
      { ...rules(), roundEnderPlayerId: "a" },
      "lastChance",
    );
    assert.equal(result.roundScores.a, 3);
    assert.equal(result.roundScores.b, 10);
  });

  it("exige les couleurs pour confirmer Dernière Chance", () => {
    const result = simulateRoundEnd(
      [player("a"), player("b")],
      { ...rules(), roundEnderPlayerId: "a" },
      "lastChance",
    );
    assert.equal(result.canConfirm, false);
    assert.ok(result.warnings.some((warning) => warning.includes("couleur")));
  });

  it("utilise les seuils de victoire selon le nombre de joueurs", () => {
    assert.equal(getRoundEndThreshold(rules({ playerCount: 2 })), 7);
    assert.equal(getRoundEndThreshold(rules({ playerCount: 3 })), 7);
    assert.equal(getRoundEndThreshold(rules({ playerCount: 4 })), 7);
    assert.equal(
      getRoundEndThreshold(
        rules({ extensions: ["extraPepper"], pepperEventId: "treasure-chest" }),
      ),
      10,
    );
  });

  it("applique le seuil de victoire final par taille de table", () => {
    for (const [playerCount, threshold] of [[2, 40], [3, 35], [4, 30]] as const) {
      const inputs = Array.from({ length: playerCount }, (_, index) =>
        player(
          `p${index + 1}`,
          index === 0 ? cards(["shell", 5, "hand"]) : [],
        ),
      );
      const result = simulateRoundEnd(
        inputs,
        {
          ...rules({ playerCount }),
          roundEnderPlayerId: "p1",
        },
        "stop",
        { p1: threshold - 9 },
      );
      assert.equal(result.winnerPlayerIds.includes("p1"), false);
    }
  });

  it("départage une égalité finale au bénéfice du joueur qui termine", () => {
    const result = simulateRoundEnd(
      [
        player("a", cards(["shell", 5, "hand"])),
        player("b", cards(["shell", 5, "hand"])),
      ],
      { ...rules(), roundEnderPlayerId: "b" },
      "stop",
      { a: 32, b: 32 },
    );
    assert.deepEqual(result.winnerPlayerIds, ["b"]);
  });

  it("termine la partie dès qu’un joueur atteint le seuil de victoire", () => {
    const result = simulateRoundEnd(
      [player("a", cards(["shell", 5, "hand"])), player("b")],
      { ...rules(), roundEnderPlayerId: "a" },
      "stop",
      { a: 32 },
    );
    assert.deepEqual(result.winnerPlayerIds, ["a"]);
  });

  it("refuse Stop sous le seuil de 7 points potentiels", () => {
    const result = simulateRoundEnd(
      [player("a", cards(["crab", 2, "hand"])), player("b")],
      { ...rules(), roundEnderPlayerId: "a" },
      "stop",
    );
    assert.equal(result.canConfirm, false);
    assert.ok(result.warnings.some((warning) => warning.includes("7 points")));
  });

  it("détecte quatre sirènes posées comme victoire immédiate", () => {
    const result = simulateRoundEnd(
      [
        player("a", cards(["siren", 4, "played"]), {
          colorCounts: { bleu: 4, jaune: 3, rose: 2, vert: 1 },
        }),
        player("b"),
      ],
      { ...rules(), roundEnderPlayerId: "a" },
      "stop",
    );
    assert.deepEqual(result.winnerPlayerIds, ["a"]);
    assert.equal(result.gameFinished, true);
  });

  it("ne déclenche pas la victoire immédiate pour des sirènes en main", () => {
    const result = simulateRoundEnd(
      [
        player("a", cards(["siren", 4, "hand"]), {
          colorCounts: { bleu: 4, jaune: 3, rose: 2, vert: 1 },
        }),
        player("b"),
      ],
      { ...rules(), roundEnderPlayerId: "a" },
      "stop",
    );
    assert.equal(result.gameFinished, false);
  });

  it("accorde le score du panier de crabes sans le compter comme crabe", () => {
    const result = calculatePotentialScore(
      player("a", cards(["crab", 2, "hand"], ["crab-basket", 1, "played"])),
      rules({ extensions: ["extraSalt"] }),
    );
    assert.equal(linePoints(result, "crab-basket"), 2);
    assert.equal(linePoints(result, "duos"), 1);
  });

  it("n’active pas les cartes d’Extra Salt avant que l’extension soit active", () => {
    const result = calculatePotentialScore(
      player("a", cards(["crab", 2, "hand"], ["crab-basket", 1, "played"])),
      rules(),
    );
    assert.equal(linePoints(result, "crab-basket"), undefined);
  });

  it("attribue la valeur des hippocampes à une collection éligible", () => {
    const result = calculatePotentialScore(
      player("a", cards(["shell", 1, "hand"], ["seahorse", 1, "hand"]), {
        seahorseAssignments: { shell: 1 },
      }),
      rules({ extensions: ["extraSalt"] }),
    );
    assert.equal(linePoints(result, "shell"), 2);
    assert.equal(result.canConfirm, true);
  });

  it("applique aussi les hippocampes aux collections de manchots", () => {
    const result = calculatePotentialScore(
      player("a", cards(["penguin", 1, "hand"], ["seahorse", 1, "hand"]), {
        seahorseAssignments: { penguin: 1 },
      }),
      rules({ extensions: ["extraSalt"] }),
    );
    assert.equal(linePoints(result, "penguin"), 3);
  });

  it("ajoute les points du trio étoile et duo", () => {
    const result = calculatePotentialScore(
      player("a", cards(["boat", 2, "played"], ["starfish", 1, "played"]), {
        starfishTrioCount: 1,
      }),
      rules({ extensions: ["extraSalt"] }),
    );
    assert.equal(linePoints(result, "duos"), 1);
    assert.equal(linePoints(result, "starfish"), 2);
    assert.equal(result.total, 3);
  });

  it("applique la Danse des coquillages Extra Pepper", () => {
    const result = calculatePotentialScore(
      player("a", cards(["shell", 2, "hand"])),
      rules({ extensions: ["extraPepper"], pepperEventId: "shell-dance" }),
    );
    assert.equal(linePoints(result, "shell"), 4);
  });

  it("applique le Kraken Extra Pepper", () => {
    const result = calculatePotentialScore(
      player("a", cards(["octopus", 3, "hand"])),
      rules({ extensions: ["extraPepper"], pepperEventId: "kraken" }),
    );
    assert.equal(linePoints(result, "octopus"), 3);
  });

  it("utilise trois sirènes posées sous Danse des sirènes", () => {
    const result = simulateRoundEnd(
      [
        player("a", cards(["siren", 3, "played"]), {
          colorCounts: { bleu: 4, jaune: 3, rose: 2 },
        }),
        player("b"),
      ],
      {
        ...rules({ extensions: ["extraPepper"], pepperEventId: "mermaid-dance" }),
        roundEnderPlayerId: "a",
      },
      "stop",
    );
    assert.deepEqual(result.winnerPlayerIds, ["a"]);
  });

  it("bloque Stop pour le Diodon", () => {
    assert.equal(
      isStopAllowed(rules({ extensions: ["extraPepper"], pepperEventId: "diodon" })),
      false,
    );
  });

  it("recalcule proprement une saisie corrigée", () => {
    const before = calculatePotentialScore(
      player("a", cards(["shell", 3, "hand"])),
      rules(),
    );
    const after = calculatePotentialScore(
      player("a", cards(["shell", 2, "hand"])),
      rules(),
    );
    assert.equal(before.total, 4);
    assert.equal(after.total, 2);
  });
});
