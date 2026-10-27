import type { ExtensionId } from "./types";

export type CardCategory =
  | "duo"
  | "collection"
  | "multiplier"
  | "mermaid"
  | "extension";

export interface CardDefinition {
  id: string;
  name: string;
  category: CardCategory;
  extension: ExtensionId | null;
  source: string;
  verified: boolean;
  help: string;
}

const BASE_SOURCE =
  "Livret français Sea Salt & Paper fourni par l’utilisateur.";
const SALT_SOURCE =
  "Livret officiel Extra Salt, studiobombyx.com/assets/EXTRA_SALT_regles_FR.pdf.";
const PEPPER_SOURCE =
  "Livret officiel Extra Pepper, studiobombyx.com/assets/EXTRAPEPPER_rules_FR.pdf.";

export const CARD_CATALOG: CardDefinition[] = [
  {
    id: "crab",
    name: "Crabe",
    category: "duo",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Une paire rapporte 1 point, même en main. Posée, elle permet de choisir une carte dans une défausse sans la consulter.",
  },
  {
    id: "boat",
    name: "Bateau",
    category: "duo",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Une paire rapporte 1 point, même en main. Posée, elle permet de rejouer immédiatement.",
  },
  {
    id: "fish",
    name: "Poisson",
    category: "duo",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Une paire rapporte 1 point, même en main. Posée, elle permet de prendre la première carte de la pioche.",
  },
  {
    id: "swimmer",
    name: "Nageur",
    category: "duo",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "En duo avec un requin, rapporte 1 point. Posé avec un requin, permet de voler au hasard une carte à un autre joueur.",
  },
  {
    id: "shark",
    name: "Requin",
    category: "duo",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "En duo avec un nageur, rapporte 1 point. Posé avec un nageur, permet de voler au hasard une carte à un autre joueur.",
  },
  {
    id: "siren",
    name: "Sirène",
    category: "mermaid",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Chaque sirène rapporte 1 point par carte de la couleur admissible, en commençant par la couleur la plus fréquente et sans réutiliser une couleur.",
  },
  {
    id: "shell",
    name: "Coquillage",
    category: "collection",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Collection : 1 à 6 coquillages rapportent respectivement 0, 2, 4, 6, 8 ou 10 points.",
  },
  {
    id: "octopus",
    name: "Poulpe",
    category: "collection",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Collection : 1 à 5 poulpes rapportent respectivement 0, 3, 6, 9 ou 12 points.",
  },
  {
    id: "penguin",
    name: "Manchot",
    category: "collection",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Collection : 1, 2 ou 3 manchots rapportent respectivement 1, 3 ou 5 points.",
  },
  {
    id: "cabin-boy",
    name: "Moussaillon",
    category: "collection",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Collection : 1 moussaillon rapporte 0 point ; 2 en rapportent 5.",
  },
  {
    id: "lighthouse",
    name: "Phare",
    category: "multiplier",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Chaque phare rapporte 1 point par carte bateau. Le phare ne compte pas comme un bateau.",
  },
  {
    id: "fish-bank",
    name: "Banc de poissons",
    category: "multiplier",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Chaque banc rapporte 1 point par carte poisson. Il ne compte pas comme un poisson.",
  },
  {
    id: "penguin-colony",
    name: "Colonie de manchots",
    category: "multiplier",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Chaque colonie rapporte 2 points par carte manchot. Elle ne compte pas comme un manchot.",
  },
  {
    id: "captain",
    name: "Capitaine",
    category: "multiplier",
    extension: null,
    source: BASE_SOURCE,
    verified: true,
    help: "Chaque capitaine rapporte 3 points par moussaillon. Il ne compte pas comme un moussaillon.",
  },
  {
    id: "medusa",
    name: "Méduse",
    category: "duo",
    extension: "extraSalt",
    source: SALT_SOURCE,
    verified: true,
    help: "En duo avec un nageur : 1 point. Les adversaires ne peuvent que piocher à leur prochain tour ; ils ne posent pas de cartes et ne terminent pas la manche.",
  },
  {
    id: "lobster",
    name: "Homard",
    category: "duo",
    extension: "extraSalt",
    source: SALT_SOURCE,
    verified: true,
    help: "En duo avec un crabe : 1 point. Posé, permet de regarder les cinq premières cartes, d’en garder une et de mélanger les quatre autres dans la pioche.",
  },
  {
    id: "crab-basket",
    name: "Panier de crabes",
    category: "multiplier",
    extension: "extraSalt",
    source: SALT_SOURCE,
    verified: true,
    help: "1 point par carte crabe. Le panier ne compte pas comme un crabe.",
  },
  {
    id: "starfish",
    name: "Étoile de mer",
    category: "extension",
    extension: "extraSalt",
    source: SALT_SOURCE,
    verified: true,
    help: "Posée avec un duo pour former un trio, elle ajoute 2 points au duo (3 points au total) et annule son effet.",
  },
  {
    id: "seahorse",
    name: "Hippocampe",
    category: "extension",
    extension: "extraSalt",
    source: SALT_SOURCE,
    verified: true,
    help: "Remplace une carte manquante d’une collection si vous avez au moins une carte de cette collection en main. Le score reste plafonné au maximum imprimé.",
  },
];

export const PEPPER_EVENTS = [
  {
    id: "hermit-crab",
    name: "Le bernard-l’ermite",
    scope: "duoEffectOverride",
    description: "Le duo de crabes permet de prendre une carte dans chaque défausse.",
    source: PEPPER_SOURCE,
  },
  {
    id: "moon-fish",
    name: "Le poisson lune",
    scope: "duoEffectOverride",
    description: "Le duo de poissons permet de prendre les deux premières cartes de la pioche.",
    source: PEPPER_SOURCE,
  },
  {
    id: "aquatic-rodeo",
    name: "Le rodéo aquatique",
    scope: "duoEffects",
    description:
      "Chaque duo vaut 1 point. Un duo de nageurs permet de regarder et d’échanger une carte avec un adversaire ; un duo de requins vole un duo posé sans en déclencher l’effet. Les combinaisons nageur + requin et nageur + méduse restent valides.",
    source: PEPPER_SOURCE,
  },
  {
    id: "shell-dance",
    name: "La danse des coquillages",
    scope: "scoreOverride",
    description: "Chaque coquillage vaut 2 points.",
    source: PEPPER_SOURCE,
  },
  {
    id: "kraken",
    name: "Le kraken",
    scope: "scoreOverride",
    description: "Chaque poulpe vaut 1 point.",
    source: PEPPER_SOURCE,
  },
  {
    id: "tornado",
    name: "La tornade",
    scope: "scoreOverride",
    description: "Les sirènes ne rapportent pas de points ; quatre sirènes posées font toujours gagner immédiatement.",
    source: PEPPER_SOURCE,
  },
  {
    id: "mermaid-dance",
    name: "La danse des sirènes",
    scope: "instantWin",
    description: "Poser trois sirènes au lieu de quatre fait gagner immédiatement.",
    source: PEPPER_SOURCE,
  },
  {
    id: "treasure-chest",
    name: "Le coffre au trésor",
    scope: "roundThreshold",
    description: "Il faut atteindre 10 points au lieu de 7 pour terminer la manche.",
    source: PEPPER_SOURCE,
  },
  {
    id: "diodon",
    name: "Le diodon",
    scope: "roundEndRestriction",
    description: "Il est interdit de terminer par Stop ; il faut annoncer Dernière Chance.",
    source: PEPPER_SOURCE,
  },
  {
    id: "angel-fish",
    name: "Le poisson ange",
    scope: "turnRule",
    description: "À la fin du tour, si les deux cartes visibles des défausses sont de la même couleur, en prendre une.",
    source: PEPPER_SOURCE,
  },
  {
    id: "dolphins",
    name: "Les dauphins",
    scope: "turnRule",
    description: "Défausser une carte de collection (coquillage, poulpe, manchot, moussaillon ou hippocampe) permet de prendre la première carte de la pioche.",
    source: PEPPER_SOURCE,
  },
  {
    id: "coral-reef",
    name: "La barrière de corail",
    scope: "defense",
    description: "Poser un coquillage face cachée protège de toutes les attaques ; il ne rapporte aucun point.",
    source: PEPPER_SOURCE,
  },
] as const;

export type PepperEventId = (typeof PEPPER_EVENTS)[number]["id"];

export const EXTENSION_LABELS: Record<ExtensionId, string> = {
  extraSalt: "Extra Salt",
  extraPepper: "Extra Pepper",
};

export const RULE_SOURCES = {
  base: BASE_SOURCE,
  extraSalt: SALT_SOURCE,
  extraPepper: PEPPER_SOURCE,
};

export const GAME_THRESHOLDS: Record<2 | 3 | 4, number> = {
  2: 40,
  3: 35,
  4: 30,
};
