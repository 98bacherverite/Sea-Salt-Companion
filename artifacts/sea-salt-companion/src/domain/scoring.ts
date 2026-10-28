import { GAME_THRESHOLDS, PEPPER_EVENTS } from "./catalog.ts";
import type {
  EndType,
  ExtensionId,
  PlayerScoreInput,
  ScoreLine,
  ScoreResult,
  SimulationResult,
} from "./types.ts";

export interface ScoringRules {
  playerCount: 2 | 3 | 4;
  extensions: ExtensionId[];
  pepperEventId?: string | null;
  ownedPepperEventId?: string | null;
  ownedPepperEvents?: Record<string, string | null>;
  roundEnderPlayerId?: string;
}

interface CardTotals {
  all: Record<string, number>;
  hand: Record<string, number>;
  played: Record<string, number>;
}

const VERIFIED_BASE_SOURCE =
  "Livret français Sea Salt & Paper fourni par l’utilisateur.";
const PEPPER_SOURCE =
  "Livret officiel Extra Pepper, studiobombyx.com/assets/EXTRAPEPPER_rules_FR.pdf.";
const UNVERIFIED_SOURCE = "Paramètre requis non confirmé par le livret.";

function cardTotals(input: PlayerScoreInput): CardTotals {
  const totals: CardTotals = { all: {}, hand: {}, played: {} };
  for (const entry of input.cards) {
    if (!Number.isInteger(entry.quantity) || entry.quantity < 0) {
      continue;
    }
    const zone = entry.zone;
    totals[zone][entry.cardId] =
      (totals[zone][entry.cardId] ?? 0) + entry.quantity;
    totals.all[entry.cardId] =
      (totals.all[entry.cardId] ?? 0) + entry.quantity;
  }
  return totals;
}

function addLine(
  lines: ScoreLine[],
  id: string,
  label: string,
  quantity: number,
  points: number | null,
  explanation: string,
  source = VERIFIED_BASE_SOURCE,
  verified = true,
): void {
  if (quantity <= 0 && points === 0) return;
  lines.push({ id, label, quantity, points, explanation, source, verified });
}

function collectionPoints(id: string, count: number): number {
  const tables: Record<string, number[]> = {
    shell: [0, 0, 2, 4, 6, 8, 10],
    octopus: [0, 0, 3, 6, 9, 12],
    penguin: [0, 1, 3, 5],
    "cabin-boy": [0, 0, 5],
  };
  const table = tables[id];
  return table?.[Math.min(count, table.length - 1)] ?? 0;
}

function colorMermaidPoints(
  sirens: number,
  colorCounts: Record<string, number> | undefined,
): { points: number | null; warning?: string } {
  if (sirens === 0) return { points: 0 };
  if (!colorCounts || Object.keys(colorCounts).length === 0) {
    return {
      points: null,
      warning: "Renseignez le nombre de cartes par couleur pour compter les sirènes.",
    };
  }
  const counts = Object.values(colorCounts);
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    return { points: null, warning: "Les quantités de couleur doivent être des entiers positifs." };
  }
  const sorted = counts.filter((count) => count > 0).sort((a, b) => b - a);
  if (sorted.length < sirens) {
    return {
      points: null,
      warning: "La règle ne précise pas le score des sirènes sans assez de couleurs distinctes.",
    };
  }
  const boundary = sorted[sirens - 1];
  if (sorted.filter((count) => count === boundary).length > 1) {
    return {
      points: null,
      warning: "Égalité de couleurs : le livret ne précise pas comment répartir les sirènes.",
    };
  }
  return { points: sorted.slice(0, sirens).reduce((sum, count) => sum + count, 0) };
}

function maximumDuoMatching(
  ids: string[],
  counts: Record<string, number>,
  allowedPairs: Array<[string, string]>,
): number {
  const pairSet = new Set(
    allowedPairs.map(([left, right]) => [left, right].sort().join("|")),
  );
  const memo = new Map<string, number>();
  const visit = (state: number[]): number => {
    const key = state.join(",");
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const leftIndex = state.findIndex((count) => count > 0);
    if (leftIndex < 0) return 0;

    const withoutLeft = [...state];
    withoutLeft[leftIndex] -= 1;
    let best = visit(withoutLeft);
    for (let rightIndex = leftIndex; rightIndex < ids.length; rightIndex += 1) {
      if (state[rightIndex] <= 0) continue;
      const pairKey = [ids[leftIndex], ids[rightIndex]].sort().join("|");
      if (!pairSet.has(pairKey)) continue;
      if (rightIndex === leftIndex && state[leftIndex] < 2) continue;
      const paired = [...state];
      paired[leftIndex] -= 1;
      paired[rightIndex] -= 1;
      best = Math.max(best, 1 + visit(paired));
    }
    memo.set(key, best);
    return best;
  };
  return visit(ids.map((id) => Math.max(0, counts[id] ?? 0)));
}

function pairScore(totals: Record<string, number>, salt: boolean, rodeo: boolean): number {
  let score =
    maximumDuoMatching(
      ["crab", "lobster"],
      totals,
      salt
        ? [
            ["crab", "crab"],
            ["crab", "lobster"],
          ]
        : [["crab", "crab"]],
    ) +
    maximumDuoMatching(
      ["boat"],
      totals,
      [["boat", "boat"]],
    ) +
    maximumDuoMatching(
      ["fish"],
      totals,
      [["fish", "fish"]],
    );

  const creaturePairs: Array<[string, string]> = [
    ["swimmer", "shark"],
    ...(salt ? [["swimmer", "medusa"] as [string, string]] : []),
    ...(rodeo
      ? ([
          ["swimmer", "swimmer"],
          ["shark", "shark"],
        ] as Array<[string, string]>)
      : []),
  ];
  score += maximumDuoMatching(
    ["swimmer", "shark", "medusa"],
    totals,
    creaturePairs,
  );
  return score;
}

function pepperEventIsActive(
  eventId: string,
  rules: ScoringRules,
  playerId?: string,
): boolean {
  return Boolean(
    rules.pepperEventId === eventId ||
      rules.ownedPepperEvents?.[playerId ?? ""] === eventId ||
      rules.ownedPepperEventId === eventId,
  );
}

function scorePlayer(
  input: PlayerScoreInput,
  rules: ScoringRules,
  options: { includeColorBonus: boolean },
): ScoreResult {
  const totals = cardTotals(input);
  const warnings: string[] = [];
  const lines: ScoreLine[] = [];
  const salt = rules.extensions.includes("extraSalt");
  const shellDance = pepperEventIsActive("shell-dance", rules, input.playerId);
  const kraken = pepperEventIsActive("kraken", rules, input.playerId);
  const tornado = pepperEventIsActive("tornado", rules, input.playerId);
  const rodeo = pepperEventIsActive("aquatic-rodeo", rules, input.playerId);

  const faceDownShellCount = input.faceDownShellCount ?? 0;
  if (
    !Number.isInteger(faceDownShellCount) ||
    faceDownShellCount < 0 ||
    faceDownShellCount > (salt ? totals.all.shell ?? 0 : 0)
  ) {
    warnings.push("Le nombre de coquillages face cachée ne correspond pas aux cartes saisies.");
  }
  const rawShells = Math.max(0, (totals.all.shell ?? 0) - faceDownShellCount);
  const octopuses = totals.all.octopus ?? 0;
  const penguins = totals.all.penguin ?? 0;
  const cabinBoys = totals.all["cabin-boy"] ?? 0;
  const mermaids = totals.all.siren ?? 0;
  const seahorseAssignments = input.seahorseAssignments ?? {};
  const assignedSeahorses = Object.values(seahorseAssignments).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  if (assignedSeahorses > (salt ? totals.all.seahorse ?? 0 : 0)) {
    warnings.push("Chaque hippocampe ne peut remplacer qu’une seule carte de collection.");
  }

  const collectionDefinitions = [
    { id: "shell", label: "Coquillages", handId: "shell", rawCount: rawShells },
    { id: "octopus", label: "Poulpes", handId: "octopus", rawCount: octopuses },
    { id: "penguin", label: "Manchots", handId: "penguin", rawCount: penguins },
    { id: "cabin-boy", label: "Moussaillons", handId: "cabin-boy", rawCount: cabinBoys },
  ] as const;
  for (const collection of collectionDefinitions) {
    const assigned = seahorseAssignments[collection.id] ?? 0;
    if (assigned < 0 || !Number.isInteger(assigned)) {
      warnings.push(`Le nombre d’hippocampes affectés aux ${collection.label.toLowerCase()} est invalide.`);
    }
    if (assigned > 0 && (totals.hand[collection.handId] ?? 0) < 1) {
      warnings.push(
        `Un hippocampe ne peut remplacer un ${collection.label.toLowerCase()} que si vous en avez au moins une carte en main.`,
      );
    }
  }

  const duoPoints = pairScore(totals.all, salt, rodeo);
  addLine(
    lines,
    "duos",
    "Duos",
    duoPoints,
    duoPoints,
    "1 point par duo ; les cartes comptent aussi lorsqu’elles sont en main.",
  );

  const shells = Math.min(6, rawShells + (seahorseAssignments.shell ?? 0));
  const adjustedOctopuses = Math.min(
    5,
    octopuses + (seahorseAssignments.octopus ?? 0),
  );
  const adjustedPenguins = Math.min(
    3,
    penguins + (seahorseAssignments.penguin ?? 0),
  );
  const adjustedCabinBoys = Math.min(
    2,
    cabinBoys + (seahorseAssignments["cabin-boy"] ?? 0),
  );
  const shellPoints = shellDance ? shells * 2 : collectionPoints("shell", shells);
  addLine(
    lines,
    "shell",
    shellDance ? "Coquillages (danse)" : "Collection de coquillages",
    shells,
    shellPoints,
    shellDance
      ? "Chaque coquillage vaut 2 points."
      : "Barème de collection du livret de base.",
    shellDance ? PEPPER_SOURCE : VERIFIED_BASE_SOURCE,
  );

  const octopusPoints = kraken
    ? adjustedOctopuses
    : collectionPoints("octopus", adjustedOctopuses);
  addLine(
    lines,
    "octopus",
    kraken ? "Poulpes (Kraken)" : "Collection de poulpes",
    adjustedOctopuses,
    octopusPoints,
    kraken ? "Chaque poulpe vaut 1 point." : "Barème de collection du livret de base.",
    kraken ? PEPPER_SOURCE : VERIFIED_BASE_SOURCE,
  );

  const penguinPoints = collectionPoints("penguin", adjustedPenguins);
  addLine(
    lines,
    "penguin",
    "Collection de manchots",
    adjustedPenguins,
    penguinPoints,
    "Barème de collection du livret de base.",
  );

  const cabinBoyPoints = collectionPoints("cabin-boy", adjustedCabinBoys);
  addLine(
    lines,
    "cabin-boy",
    "Collection de moussaillons",
    adjustedCabinBoys,
    cabinBoyPoints,
    "Barème de collection du livret de base.",
  );

  const seahorses = salt ? totals.all.seahorse ?? 0 : 0;
  if (seahorses > 0) {
    if (assignedSeahorses !== seahorses) {
      warnings.push(
        "Affectez chaque hippocampe à une collection pour calculer son score.",
      );
    }
    addLine(
      lines,
      "seahorse",
      "Hippocampes",
      seahorses,
      0,
      `${assignedSeahorses} hippocampe(s) affecté(s) ; leur valeur est incluse dans les collections correspondantes, avec plafond officiel.`,
      "Livret officiel Extra Salt, studiobombyx.com/assets/EXTRA_SALT_regles_FR.pdf.",
    );
  }

  const multipliers: Array<[string, string, number, number, string]> = [
    ["lighthouse", "Phare", totals.all.boat ?? 0, 1, "bateau"],
    ["fish-bank", "Banc de poissons", totals.all.fish ?? 0, 1, "poisson"],
    ["penguin-colony", "Colonie de manchots", adjustedPenguins, 2, "manchot"],
    ["captain", "Capitaine", adjustedCabinBoys, 3, "moussaillon"],
  ];
  for (const [id, label, targetCount, pointsPerTarget, targetName] of multipliers) {
    const count = totals.all[id] ?? 0;
    const points = count * targetCount * pointsPerTarget;
    addLine(
      lines,
      id,
      label,
      count,
      points,
      `${count} × ${targetCount} ${targetName}(s) × ${pointsPerTarget} point(s).`,
    );
  }

  if (salt) {
    const crabBaskets = totals.all["crab-basket"] ?? 0;
    addLine(
      lines,
      "crab-basket",
      "Panier de crabes",
      crabBaskets,
      crabBaskets * (totals.all.crab ?? 0),
      "1 point par crabe ; le panier ne compte pas comme un crabe.",
      "Livret officiel Extra Salt, studiobombyx.com/assets/EXTRA_SALT_regles_FR.pdf.",
    );
    const starfishTrioCount = input.starfishTrioCount ?? 0;
    const playedPairCount = pairScore(totals.played, salt, rodeo);
    if (
      !Number.isInteger(starfishTrioCount) ||
      starfishTrioCount < 0 ||
      starfishTrioCount >
        Math.min(totals.played.starfish ?? 0, playedPairCount)
    ) {
      warnings.push(
        "Chaque trio étoile + duo doit utiliser des cartes posées et saisies.",
      );
    }
    const starfishPoints = starfishTrioCount * 2;
    addLine(
      lines,
      "starfish",
      "Étoiles de mer en trio",
      input.starfishTrioCount ?? 0,
      starfishPoints,
      "Chaque étoile posée avec un duo ajoute 2 points ; l’effet du duo est annulé.",
      "Livret officiel Extra Salt, studiobombyx.com/assets/EXTRA_SALT_regles_FR.pdf.",
    );
  }

  const mermaidScore =
    mermaids === 0 || tornado
      ? { points: 0 }
      : colorMermaidPoints(mermaids, input.colorCounts);
  if (mermaidScore.warning) warnings.push(mermaidScore.warning);
  addLine(
    lines,
    "siren",
    "Points des sirènes",
    mermaids,
    mermaidScore.points,
    tornado
      ? "La Tornade désactive les points des sirènes, mais pas leur condition de victoire."
      : "Les sirènes prennent les couleurs admissibles les plus fréquentes, sans répéter une couleur.",
    tornado ? PEPPER_SOURCE : VERIFIED_BASE_SOURCE,
    mermaidScore.points !== null,
  );

  const cardLinesKnown = lines.every((line) => line.points !== null);
  const cardPoints = cardLinesKnown
    ? lines.reduce((sum, line) => sum + (line.points ?? 0), 0)
    : null;

  let colorBonus: number | null = 0;
  if (options.includeColorBonus) {
    if (!input.colorCounts || Object.keys(input.colorCounts).length === 0) {
      colorBonus = null;
      warnings.push("Renseignez les cartes par couleur pour calculer le bonus de Dernière Chance.");
    } else {
      const values = Object.values(input.colorCounts);
      if (values.some((count) => !Number.isInteger(count) || count < 0)) {
        colorBonus = null;
        warnings.push("Les quantités de couleur doivent être des entiers positifs.");
      } else {
        const positiveValues = values.filter((value) => value > 0);
        const maximum = Math.max(0, ...positiveValues);
        if (
          maximum > 0 &&
          positiveValues.filter((value) => value === maximum).length > 1
        ) {
          colorBonus = null;
          warnings.push("Égalité de couleurs : le bonus ne peut pas être départagé automatiquement.");
        } else {
          colorBonus = maximum;
        }
      }
    }
    if (colorBonus !== null) {
      addLine(
        lines,
        "last-chance-color-bonus",
        "Bonus couleur",
        colorBonus,
        colorBonus,
        "1 point par carte de la couleur la plus fréquente.",
      );
    }
  }

  const total =
    cardPoints === null || colorBonus === null
      ? null
      : cardPoints + colorBonus;
  return {
    total,
    lines,
    warnings,
    canConfirm:
      total !== null &&
      warnings.length === 0 &&
      lines.every((line) => line.verified),
    cardPoints,
    colorBonus,
  };
}

export function calculatePotentialScore(
  input: PlayerScoreInput,
  rules: ScoringRules,
): ScoreResult {
  return scorePlayer(input, rules, { includeColorBonus: false });
}

export function simulateRoundEnd(
  inputs: PlayerScoreInput[],
  rules: ScoringRules,
  endType: EndType,
  cumulativeScores: Record<string, number> = {},
): SimulationResult {
  const scoreResults = Object.fromEntries(
    inputs.map((input) => [
      input.playerId,
      scorePlayer(
        input,
        {
          ...rules,
          ownedPepperEventId:
            rules.ownedPepperEvents?.[input.playerId] ??
            rules.ownedPepperEventId,
        },
        { includeColorBonus: endType === "lastChance" },
      ),
    ]),
  );
  const warnings = Object.values(scoreResults).flatMap((result) => result.warnings);
  let canConfirm = Object.values(scoreResults).every((result) => result.canConfirm);
  const roundScores: Record<string, number> = {};

  if (!rules.roundEnderPlayerId) {
    warnings.push("Sélectionnez le joueur qui termine la manche.");
    canConfirm = false;
  }
  if (
    endType === "stop" &&
    rules.roundEnderPlayerId &&
    !isStopAllowed(
      {
        ...rules,
        ownedPepperEventId:
          rules.ownedPepperEvents?.[rules.roundEnderPlayerId] ??
          rules.ownedPepperEventId,
      },
      rules.roundEnderPlayerId,
    )
  ) {
    warnings.push("Le Diodon interdit Stop à ce joueur cette manche.");
    canConfirm = false;
  }
  if (rules.roundEnderPlayerId) {
    const enderResult = scoreResults[rules.roundEnderPlayerId];
    const enderRules = {
      ...rules,
      ownedPepperEventId:
        rules.ownedPepperEvents?.[rules.roundEnderPlayerId] ??
        rules.ownedPepperEventId,
    };
    const callThreshold = getRoundEndThreshold(
      enderRules,
      rules.roundEnderPlayerId,
    );
    if (
      enderResult?.cardPoints !== null &&
      enderResult?.cardPoints !== undefined &&
      enderResult.cardPoints < callThreshold
    ) {
      warnings.push(
        `${endType === "stop" ? "Stop" : "Dernière Chance"} exige au moins ${callThreshold} points potentiels.`,
      );
      canConfirm = false;
    }
  }

  if (canConfirm && endType === "stop") {
    for (const input of inputs) {
      roundScores[input.playerId] = scoreResults[input.playerId].cardPoints ?? 0;
    }
  } else if (canConfirm && endType === "lastChance" && inputs.length > 0) {
    const caller = inputs.find(
      (input) => input.playerId === rules.roundEnderPlayerId,
    );
    if (!caller) {
      warnings.push("Le joueur ayant annoncé Dernière Chance doit être sélectionné.");
    } else {
      const callerScore = scoreResults[caller.playerId].cardPoints ?? 0;
      const winsBet = inputs.every(
        (input) =>
          input.playerId === caller.playerId ||
          callerScore >= (scoreResults[input.playerId].cardPoints ?? 0),
      );
      for (const input of inputs) {
        const result = scoreResults[input.playerId];
        if (input.playerId === caller.playerId) {
          roundScores[input.playerId] = winsBet
            ? callerScore + (result.colorBonus ?? 0)
            : result.colorBonus ?? 0;
        } else {
          roundScores[input.playerId] = winsBet
            ? result.colorBonus ?? 0
            : result.cardPoints ?? 0;
        }
      }
    }
  }

  const threshold = GAME_THRESHOLDS[rules.playerCount];
  const totals = Object.fromEntries(
    inputs.map((input) => [
      input.playerId,
      (cumulativeScores[input.playerId] ?? 0) +
        (roundScores[input.playerId] ?? 0),
    ]),
  );
  const topScore = Math.max(0, ...Object.values(totals));
  const candidates = Object.entries(totals)
    .filter(([, score]) => score === topScore && score >= threshold)
    .map(([id]) => id);

  let winnerPlayerIds = candidates;
  if (candidates.length > 1 && rules.roundEnderPlayerId) {
    winnerPlayerIds = candidates.includes(rules.roundEnderPlayerId)
      ? [rules.roundEnderPlayerId]
      : candidates;
  }

  const immediateWinners = inputs
    .filter(
      (input) =>
        (cardTotals(input).played.siren ?? 0) >=
        activeSirenWinCount(
          {
            ...rules,
            ownedPepperEventId:
              rules.ownedPepperEvents?.[input.playerId] ??
              rules.ownedPepperEventId,
          },
          input.playerId,
        ),
    )
    .map((input) => input.playerId);
  if (immediateWinners.length > 0) {
    winnerPlayerIds = immediateWinners;
  }

  return {
    endType,
    roundScores,
    scoreResults,
    warnings,
    canConfirm,
    winnerPlayerIds,
    gameFinished: winnerPlayerIds.length > 0,
    threshold,
  };
}

function activeSirenWinCount(rules: ScoringRules, playerId?: string): number {
  const eventIds = [
    rules.pepperEventId,
    rules.ownedPepperEvents?.[playerId ?? ""],
    rules.ownedPepperEventId,
  ];
  return eventIds.includes("mermaid-dance") ? 3 : 4;
}

export function getRoundEndThreshold(
  rules: ScoringRules,
  playerId?: string,
): number {
  const treasureChest = pepperEventIsActive("treasure-chest", rules, playerId);
  return treasureChest ? 10 : 7;
}

export function isStopAllowed(
  rules: ScoringRules,
  playerId?: string,
): boolean {
  return !pepperEventIsActive("diodon", rules, playerId);
}

export function getPepperEventDescription(eventId: string): string | undefined {
  return PEPPER_EVENTS.find((event) => event.id === eventId)?.description;
}

export function resolvePepperOwner(
  direction: "highest" | "lowest" | "needsVerification",
  totals: Record<string, number>,
): { ownerId: string | null; tied: boolean } {
  const scoreEntries = Object.entries(totals);
  if (scoreEntries.length === 0) return { ownerId: null, tied: false };
  if (direction === "needsVerification") return { ownerId: null, tied: false };
  const target = direction === "highest"
    ? Math.max(...scoreEntries.map(([, score]) => score))
    : Math.min(...scoreEntries.map(([, score]) => score));
  const candidates = scoreEntries
    .filter(([, score]) => score === target)
    .map(([id]) => id);
  return candidates.length === 1
    ? { ownerId: candidates[0], tied: false }
    : { ownerId: null, tied: true };
}

export function getEventDefinition(eventId: string) {
  return PEPPER_EVENTS.find((event) => event.id === eventId);
}

export const SCORING_RULES_SOURCE_NOTE = UNVERIFIED_SOURCE;
