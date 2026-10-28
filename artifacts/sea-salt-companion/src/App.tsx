import { useMemo, useState, type ReactNode } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Anchor, ArrowLeft, BookOpen, Check, ChevronRight, CircleHelp, Clock3,
  History, Minus, Plus, Search, Shell, Sparkles, Users, X,
} from 'lucide-react';
import { CARD_CATALOG, PEPPER_EVENTS } from '@/domain/catalog';
import { calculatePotentialScore } from '@/domain/scoring';
import type { ScoreResult } from '@/domain/types';

type ExtensionId = 'extraSalt' | 'extraPepper';
type Zone = 'hand' | 'played';
type EndType = 'stop' | 'lastChance';

export interface Player { id: string; name: string; createdAt?: string }
export interface CardCount { cardId: string; quantity: number; zone: Zone }
export interface Round {
  id: string;
  index: number;
  status: 'inProgress' | 'completed' | 'cancelled';
  endType?: EndType;
  scores: Record<string, number>;
  entries: Record<string, CardCount[]>;
  colorCounts?: Record<string, Record<string, number>>;
  seahorseAssignments?: Record<string, Partial<Record<'shell' | 'octopus' | 'penguin' | 'cabin-boy', number>>>;
  starfishTrioCounts?: Record<string, number>;
  faceDownShellCounts?: Record<string, number>;
  activeExtensions?: ExtensionId[];
  pepperEventId?: string | null;
}
export interface Game {
  id: string;
  status: 'inProgress' | 'finished';
  playerIds: string[];
  players: Player[];
  extensions: ExtensionId[];
  scheduledExtensions?: ExtensionId[];
  totalScores?: Record<string, number>;
  rounds: Round[];
  createdAt: string;
}
export interface EndRoundPreview {
  gameId: string;
  roundId: string;
  endType: EndType;
  scores: Record<string, number>;
  warnings?: string[];
  canConfirm?: boolean;
  details?: Record<string, string[]>;
}
export interface SeaSaltCompanionAdapter {
  games?: Game[];
  endPreview?: EndRoundPreview;
  onCreateGame?: (game: Game) => void;
  onResumeGame?: (gameId: string) => void;
  onUpdateEntries?: (gameId: string, roundId: string, playerId: string, entries: CardCount[]) => void;
  onUpdateColorCounts?: (gameId: string, roundId: string, playerId: string, counts: Record<string, number>) => void;
  onUpdateSaltOptions?: (
    gameId: string,
    roundId: string,
    playerId: string,
    options: {
      seahorseAssignments: Partial<Record<'shell' | 'octopus' | 'penguin' | 'cabin-boy', number>>;
      starfishTrioCount: number;
      faceDownShellCount: number;
    },
  ) => void;
  onSetPepperEvent?: (gameId: string, roundId: string, eventId: string | null) => void;
  onRequestEndRound?: (gameId: string, roundId: string, endType: EndType, enderPlayerId?: string) => void;
  onConfirmEndRound?: (gameId: string, roundId: string, endType: EndType, enderPlayerId?: string) => void;
  onScheduleExtension?: (gameId: string, extension: ExtensionId) => void;
  onCancelScheduledExtension?: (gameId: string, extension: ExtensionId) => void;
}

const cardTypes = CARD_CATALOG.map((card) => ({ id: card.id, name: card.name }));
const helpCards = [
  ...CARD_CATALOG.map((card) => ({
    id: card.id,
    name: card.name,
    category: card.extension ? 'Extensions' : 'Cartes',
    description: card.help,
    needsCheck: !card.verified,
  })),
  ...PEPPER_EVENTS.map((event) => ({
    id: event.id,
    name: event.name,
    category: 'Extensions',
    description: event.description,
    needsCheck: false,
  })),
  {
    id: 'color-tie',
    name: 'Égalité de couleur',
    category: 'Règles',
    description: 'En cas d’égalité impliquant une couleur, ne tranchez pas avec cette aide : vérifiez la règle de votre édition.',
    needsCheck: true,
  },
  {
    id: 'extraSalt',
    name: 'Extension Extra Salt',
    category: 'Extensions',
    description: 'Activation préparée pour la prochaine manche. Les cartes de l’extension ne sont pas ajoutées à la manche en cours.',
    needsCheck: false,
  },
  {
    id: 'extraPepper',
    name: 'Extension Extra Pepper',
    category: 'Extensions',
    description: 'Activation préparée pour la prochaine manche. Les cartes de l’extension ne sont pas ajoutées à la manche en cours.',
    needsCheck: false,
  },
];

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const frenchDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(date));

function colorCountsToText(counts: Record<string, number>) {
  return Object.entries(counts)
    .map(([color, count]) => `${color}: ${count}`)
    .join(', ');
}

function parseColorCounts(value: string): Record<string, number> | null {
  if (!value.trim()) return {};
  const result: Record<string, number> = {};
  for (const part of value.split(',')) {
    const match = part.trim().match(/^(.+?)\s*:\s*(\d+)$/);
    if (!match) return null;
    const key = match[1].trim().toLocaleLowerCase('fr');
    if (!key || Object.hasOwn(result, key)) return null;
    result[key] = Number(match[2]);
  }
  return result;
}

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Sea Salt Companion, accueil" data-testid="link-home-brand">
      <span className="brand-mark"><Shell size={19} strokeWidth={1.9} /></span>
      <span><span className="brand-name">Sea Salt Companion</span><span className="brand-caption">Compagnon de table</span></span>
    </Link>
  );
}

function Modal({ title, description, onClose, children, wide = false, testId }: {
  title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean; testId: string;
}) {
  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`dialog${wide ? ' dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`} data-testid={testId}>
        <div className="dialog-head">
          <div><h2 id={`${testId}-title`}>{title}</h2>{description && <p>{description}</p>}</div>
          <button className="icon-button" type="button" aria-label="Fermer" data-testid={`button-close-${testId}`} onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function App({ adapter }: { adapter?: SeaSaltCompanionAdapter } = {}) {
  const [location, setLocation] = useLocation();
  const [externalGames, setExternalGames] = useState<Game[] | undefined>();
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [playersCount, setPlayersCount] = useState(2);
  const [names, setNames] = useState(['', '']);
  const [extensions, setExtensions] = useState<ExtensionId[]>([]);
  const [panel, setPanel] = useState<'history' | 'quickCount' | 'review' | null>(null);
  const [reviewEndType, setReviewEndType] = useState<EndType>('stop');
  const [pendingExtensions, setPendingExtensions] = useState<ExtensionId[]>([]);
  const [entriesDraft, setEntriesDraft] = useState<Record<string, Record<string, CardCount[]>>>({});
  const [quickCounts, setQuickCounts] = useState<Record<string, number>>({});
  const [selectedEnderId, setSelectedEnderId] = useState('');
  const [colorTextDraft, setColorTextDraft] = useState<Record<string, string>>({});
  const [invalidColorDraft, setInvalidColorDraft] = useState<Record<string, boolean>>({});
  const [quickColorText, setQuickColorText] = useState('');
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleFilter, setRuleFilter] = useState('Tout');
  const [notice, setNotice] = useState('');
  const games = adapter?.games ?? externalGames ?? [];
  const activeGame = games.find((game) => game.id === activeGameId);
  const activeRound = activeGame?.status === 'inProgress'
    ? activeGame.rounds.find((round) => round.status === 'inProgress')
    : undefined;
  const activeCardTypes = cardTypes.filter((card) => {
    const definition = CARD_CATALOG.find((item) => item.id === card.id);
    return !definition?.extension
      || Boolean(activeRound?.activeExtensions?.includes(definition.extension))
      || activeGame?.extensions.includes(definition.extension);
  });
  const endPreview = adapter?.endPreview;
  const quickColorCounts = parseColorCounts(quickColorText);
  const quickEntries = Object.entries(quickCounts)
    .filter(([, quantity]) => quantity > 0)
    .map(([cardId, quantity]) => ({ cardId, quantity, zone: 'hand' as const }));
  const quickScore: ScoreResult = calculatePotentialScore(
    {
      playerId: 'quick-count',
      cards: quickEntries,
      colorCounts: quickColorCounts ?? undefined,
    },
    { playerCount: 2, extensions: [], pepperEventId: null },
  );
  const hasMatchingPreview = Boolean(activeGame && activeRound && endPreview
    && endPreview.gameId === activeGame.id
    && endPreview.roundId === activeRound.id
    && endPreview.endType === reviewEndType);
  const home = location === '/';

  const updateLocalGame = (game: Game) => {
    setExternalGames((previous) => [game, ...(previous ?? []).filter((item) => item.id !== game.id)]);
  };

  const createGame = () => {
    const players = Array.from({ length: playersCount }, (_, index) => ({
      id: createId(),
      name: names[index]?.trim() || `Joueur ${index + 1}`,
    }));
    const game: Game = {
      id: createId(),
      status: 'inProgress',
      playerIds: players.map((player) => player.id),
      players,
      extensions: [...extensions],
      rounds: [{ id: createId(), index: 1, status: 'inProgress', scores: {}, entries: {}, activeExtensions: [...extensions] }],
      createdAt: new Date().toISOString(),
    };
    adapter?.onCreateGame?.(game);
    if (!adapter?.games) updateLocalGame(game);
    setActiveGameId(game.id);
    setNames(Array.from({ length: playersCount }, () => ''));
    setExtensions([]);
    setNotice('');
  };

  const openGame = (game: Game) => {
    adapter?.onResumeGame?.(game.id);
    setActiveGameId(game.id);
    setPendingExtensions(game.scheduledExtensions ?? []);
    setNotice('');
  };

  const setCount = (playerId: string, cardId: string, zone: Zone, delta: number) => {
    if (!activeGame || !activeRound) return;
    const previous = entriesDraft[activeRound.id]?.[playerId]
      ?? activeRound.entries[playerId]
      ?? [];
    const current = previous.find((entry) => entry.cardId === cardId && entry.zone === zone)?.quantity ?? 0;
    const quantity = Math.max(0, current + delta);
    const next = previous.filter((entry) => !(entry.cardId === cardId && entry.zone === zone));
    if (quantity > 0) next.push({ cardId, quantity, zone });
    setEntriesDraft((draft) => ({ ...draft, [activeRound.id]: { ...draft[activeRound.id], [playerId]: next } }));
    adapter?.onUpdateEntries?.(activeGame.id, activeRound.id, playerId, next);
  };

  const getEntries = (playerId: string) => {
    if (!activeRound) return [];
    return entriesDraft[activeRound.id]?.[playerId] ?? activeRound.entries[playerId] ?? [];
  };
  const getCount = (playerId: string, cardId: string, zone: Zone) =>
    getEntries(playerId).find((entry) => entry.cardId === cardId && entry.zone === zone)?.quantity ?? 0;

  const requestEnd = (type: EndType) => {
    if (!activeGame || !activeRound) return;
    setReviewEndType(type);
    setSelectedEnderId('');
    adapter?.onRequestEndRound?.(activeGame.id, activeRound.id, type);
    setPanel('review');
  };

  const selectEnder = (playerId: string) => {
    setSelectedEnderId(playerId);
    if (activeGame && activeRound) {
      adapter?.onRequestEndRound?.(activeGame.id, activeRound.id, reviewEndType, playerId);
    }
  };

  const confirmEnd = () => {
    if (!activeGame || !activeRound) return;
    adapter?.onConfirmEndRound?.(activeGame.id, activeRound.id, reviewEndType, selectedEnderId || undefined);
    if (!adapter?.games) {
      const completed: Round = { ...activeRound, status: 'completed', endType: reviewEndType };
      updateLocalGame({
        ...activeGame,
        extensions: [...new Set([...activeGame.extensions, ...pendingExtensions])],
        rounds: [
          ...activeGame.rounds.filter((round) => round.id !== activeRound.id),
          completed,
          { id: createId(), index: activeRound.index + 1, status: 'inProgress', scores: {}, entries: {} },
        ],
      });
    }
    setEntriesDraft({});
    setPendingExtensions([]);
    setPanel(null);
    setNotice('Manche confirmée. La prochaine manche est prête.');
  };

  const scheduleExtension = (extension: ExtensionId) => {
    if (!activeGame) return;
    const alreadyQueued = pendingExtensions.includes(extension);
    if (alreadyQueued) {
      setPendingExtensions((current) => current.filter((item) => item !== extension));
      adapter?.onCancelScheduledExtension?.(activeGame.id, extension);
    } else if (!activeGame.extensions.includes(extension)) {
      setPendingExtensions((current) => [...current, extension]);
      adapter?.onScheduleExtension?.(activeGame.id, extension);
    }
  };

  const filteredHelp = useMemo(() => helpCards.filter((card) =>
    (ruleFilter === 'Tout' || card.category === ruleFilter)
    && `${card.name} ${card.description}`.toLocaleLowerCase('fr').includes(ruleSearch.toLocaleLowerCase('fr'))), [ruleFilter, ruleSearch]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="top-nav" aria-label="Navigation principale">
            <Link href="/" className={`nav-link${home ? ' active' : ''}`} data-testid="link-navigation-accueil">Partie</Link>
            <Link href="/rules" className={`nav-link${location === '/rules' ? ' active' : ''}`} data-testid="link-navigation-regles"><BookOpen size={15} /> Règles</Link>
            <button className="nav-link" type="button" data-testid="button-navigation-history" onClick={() => setPanel('history')}><History size={15} /> Historique</button>
            <button className="nav-link" type="button" data-testid="button-navigation-count" onClick={() => setPanel('quickCount')}><Sparkles size={15} /> Comptage rapide</button>
          </nav>
          <span className="status-line" aria-label="Parties enregistrées sur cet appareil" data-testid="status-offline-ready"><span className="status-dot" /> Local</span>
        </div>
      </header>

      <Switch>
        <Route path="/rules">
          <main className="page">
            <div className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>À portée de main</div>
            <h1 className="section-title" style={{ fontSize: 42, marginTop: 9 }}>Aide de table</h1>
            <p className="section-subtitle">Retrouvez une carte ou une extension sans quitter la partie.</p>
            <div className="rule-toolbar">
              <label className="rule-search">
                <Search size={17} />
                <input className="text-input" type="search" value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} placeholder="Rechercher une carte…" aria-label="Rechercher une carte ou une extension" data-testid="input-rule-search" />
              </label>
              <div className="rule-tabs" role="group" aria-label="Filtrer l’aide">
                {['Tout', 'Cartes', 'Extensions', 'Règles'].map((filter) => <button key={filter} type="button" className={`rule-tab${ruleFilter === filter ? ' selected' : ''}`} aria-pressed={ruleFilter === filter} data-testid={`button-rule-filter-${filter.toLowerCase()}`} onClick={() => setRuleFilter(filter)}>{filter}</button>)}
              </div>
            </div>
            {filteredHelp.length ? <div className="rule-grid">
              {filteredHelp.map((card) => <article className="panel rule-card" key={card.id} data-testid={`card-rule-${card.id}`}>
                <span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>{card.category}</span>
                <h3>{card.name}</h3>
                <p>{card.description}</p>
                {card.needsCheck && <div style={{ marginTop: 11 }}><span className="rule-check">Règle à vérifier</span></div>}
              </article>)}
            </div> : <div className="empty-box" data-testid="empty-rule-search">Aucun résultat. Essayez un autre nom de carte.</div>}
            <div className="pending-note" style={{ marginTop: 18 }}><CircleHelp size={18} /> Les effets et décomptes détaillés ne sont pas reproduits ici : en cas de doute, le livret de votre édition fait foi.</div>
          </main>
        </Route>
        <Route path="/">
          {activeGame && activeRound ? (
            <main className="page">
              <div className="game-header">
                <div>
                  <button className="button button-quiet" style={{ minHeight: 40, padding: '0 12px' }} type="button" data-testid="button-back-home" onClick={() => { setActiveGameId(null); setNotice(''); }}><ArrowLeft size={16} /> Accueil</button>
                  <h1 data-testid="text-active-game-title">À la table</h1>
                </div>
                <div className="game-toolbar">
                  <button className="button button-quiet" type="button" data-testid="button-game-rules" onClick={() => setLocation('/rules')}><BookOpen size={16} /><span>Règles</span></button>
                </div>
              </div>
              <div className="round-banner" data-testid="status-current-round">
                <div><small>Manche en cours</small><strong>Manche {activeRound.index}</strong></div>
                <div className="status-line" style={{ color: 'inherit' }}><span className="status-dot" /> En cours</div>
              </div>
              {activeRound.activeExtensions?.includes('extraPepper') && <label className="event-selector">
                <span className="field-label">Événement Extra Pepper révélé cette manche</span>
                <select
                  className="text-input"
                  value={activeRound.pepperEventId ?? ''}
                  onChange={(event) => adapter?.onSetPepperEvent?.(activeGame.id, activeRound.id, event.target.value || null)}
                  aria-label="Événement Extra Pepper de la manche"
                  data-testid="select-pepper-event"
                >
                  <option value="">Choisir la carte révélée</option>
                  {PEPPER_EVENTS.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                </select>
                {activeRound.pepperEventId && <span className="helper-text">{PEPPER_EVENTS.find((event) => event.id === activeRound.pepperEventId)?.description}</span>}
                <span className="rule-check">Vérifiez le pictogramme de priorité sur la carte physique pour son attribution.</span>
              </label>}
              {notice && <div className="pending-note" role="status" data-testid="status-game-notice"><Check size={17} /> {notice}</div>}
              {pendingExtensions.length > 0 && <div className="pending-note" role="status" data-testid="status-extension-pending"><Sparkles size={17} /> Pour la prochaine manche : {pendingExtensions.map((item) => item === 'extraSalt' ? 'Extra Salt' : 'Extra Pepper').join(' et ')}.</div>}
              <div className="player-score-grid">
                {activeGame.players.map((player) => {
                  const score = activeRound.scores[player.id];
                  const cumulative = activeGame.totalScores?.[player.id] ?? 0;
                  const sirenWinThreshold = activeRound.pepperEventId === 'mermaid-dance' ? 3 : 4;
                  const immediateSirenWin = getCount(player.id, 'siren', 'played') >= sirenWinThreshold;
                  return <article className="player-card" key={player.id} data-testid={`card-player-${player.id}`}>
                    <div className="player-card-top">
                      <div><div className="player-name" data-testid={`text-player-name-${player.id}`}>{player.name}</div><div className="player-total" data-testid={`text-player-score-${player.id}`}>{cumulative}</div><div className="score-caption">score cumulé</div><div className="score-caption">Manche : {invalidColorDraft[player.id] ? 'saisie à corriger' : typeof score === 'number' ? `${score} pts potentiels` : 'calcul à vérifier'}</div>{typeof score === 'number' && score >= (activeRound.pepperEventId === 'treasure-chest' ? 10 : 7) && <span className="rule-check" role="status">Seuil de fin de manche atteint</span>}</div>
                      <span className="pill">Joueur {activeGame.players.indexOf(player) + 1}</span>
                    </div>
                    {immediateSirenWin && <div className="pending-note" role="alert" data-testid={`status-immediate-win-${player.id}`}><Sparkles size={17} /> Victoire immédiate par les sirènes posées : vérifiez la saisie avant de confirmer.</div>}
                    <div className="player-card-body">
                      {activeCardTypes.map((card) => <div className="card-counter" key={card.id}>
                        <div className="card-name">{card.name}</div>
                        {(['hand', 'played'] as Zone[]).map((zone) => {
                          const zoneLabel = zone === 'hand' ? 'En main' : 'Posées';
                          return <div className="zone-count" key={zone}>
                            <span className="zone-label">{zoneLabel}</span>
                            <button className="count-button" type="button" aria-label={`Retirer une carte ${card.name} ${zoneLabel.toLowerCase()} pour ${player.name}`} data-testid={`button-decrement-${zone}-${player.id}-${card.id}`} onClick={() => setCount(player.id, card.id, zone, -1)}><Minus size={15} /></button>
                            <span className="count-value" aria-label={`${getCount(player.id, card.id, zone)} ${zoneLabel.toLowerCase()}`}>{getCount(player.id, card.id, zone)}</span>
                            <button className="count-button" type="button" aria-label={`Ajouter une carte ${card.name} ${zoneLabel.toLowerCase()} pour ${player.name}`} data-testid={`button-increment-${zone}-${player.id}-${card.id}`} onClick={() => setCount(player.id, card.id, zone, 1)}><Plus size={15} /></button>
                          </div>;
                        })}
                      </div>)}
                    </div>
            <label className="color-count-entry">
              <span className="field-label">Couleurs · nécessaire pour les sirènes et Dernière Chance</span>
              <input
                className="text-input"
                value={colorTextDraft[player.id] ?? colorCountsToText(activeRound.colorCounts?.[player.id] ?? {})}
                onChange={(event) => {
                  const value = event.target.value;
                  setColorTextDraft((draft) => ({ ...draft, [player.id]: value }));
                  const parsed = parseColorCounts(value);
                          setInvalidColorDraft((draft) => ({ ...draft, [player.id]: parsed === null }));
                  if (parsed && activeGame && activeRound) {
                    adapter?.onUpdateColorCounts?.(activeGame.id, activeRound.id, player.id, parsed);
                  }
                }}
                placeholder="Ex. bleu: 3, jaune: 2"
                aria-label={`Nombre de cartes par couleur pour ${player.name}`}
                data-testid={`input-color-counts-${player.id}`}
              />
              {invalidColorDraft[player.id] && <span className="validation-message" role="alert">Format attendu : bleu: 3, jaune: 2.</span>}
            </label>
            {activeRound.activeExtensions?.includes('extraSalt') && <details className="salt-options">
              <summary>Options de score Extra Salt</summary>
              {(() => {
                const assignments = activeRound.seahorseAssignments?.[player.id] ?? {};
                const trioCount = activeRound.starfishTrioCounts?.[player.id] ?? 0;
                const faceDownCount = activeRound.faceDownShellCounts?.[player.id] ?? 0;
                const update = (patch: Partial<{
                  seahorseAssignments: Partial<Record<'shell' | 'octopus' | 'penguin' | 'cabin-boy', number>>;
                  starfishTrioCount: number;
                  faceDownShellCount: number;
                }>) => adapter?.onUpdateSaltOptions?.(activeGame.id, activeRound.id, player.id, {
                  seahorseAssignments: patch.seahorseAssignments ?? assignments,
                  starfishTrioCount: patch.starfishTrioCount ?? trioCount,
                  faceDownShellCount: patch.faceDownShellCount ?? faceDownCount,
                });
                const assignmentsLabels = [
                  ['shell', 'Coquillages'],
                  ['octopus', 'Poulpes'],
                  ['penguin', 'Manchots'],
                  ['cabin-boy', 'Moussaillons'],
                ] as const;
                return <>
                  <p className="helper-text">Attribuez chaque hippocampe à une collection admissible. Vérifiez les conditions sur la carte.</p>
                  {assignmentsLabels.map(([key, label]) => <div className="salt-option-row" key={key}>
                    <span>{label}</span>
                    <button className="count-button" type="button" aria-label={`Retirer un hippocampe des ${label.toLowerCase()} de ${player.name}`} onClick={() => update({ seahorseAssignments: { ...assignments, [key]: Math.max(0, (assignments[key] ?? 0) - 1) } })}><Minus size={15} /></button>
                    <strong>{assignments[key] ?? 0}</strong>
                    <button className="count-button" type="button" aria-label={`Affecter un hippocampe aux ${label.toLowerCase()} de ${player.name}`} onClick={() => update({ seahorseAssignments: { ...assignments, [key]: (assignments[key] ?? 0) + 1 } })}><Plus size={15} /></button>
                  </div>)}
                  <div className="salt-option-row">
                    <span>Trio étoile + duo</span>
                    <button className="count-button" type="button" aria-label={`Retirer un trio étoile de ${player.name}`} onClick={() => update({ starfishTrioCount: Math.max(0, trioCount - 1) })}><Minus size={15} /></button>
                    <strong>{trioCount}</strong>
                    <button className="count-button" type="button" aria-label={`Ajouter un trio étoile à ${player.name}`} onClick={() => update({ starfishTrioCount: trioCount + 1 })}><Plus size={15} /></button>
                  </div>
                  <div className="salt-option-row">
                    <span>Coquillages face cachée</span>
                    <button className="count-button" type="button" aria-label={`Retirer un coquillage protégé de ${player.name}`} onClick={() => update({ faceDownShellCount: Math.max(0, faceDownCount - 1) })}><Minus size={15} /></button>
                    <strong>{faceDownCount}</strong>
                    <button className="count-button" type="button" aria-label={`Ajouter un coquillage protégé à ${player.name}`} onClick={() => update({ faceDownShellCount: faceDownCount + 1 })}><Plus size={15} /></button>
                  </div>
                </>;
              })()}
            </details>}
                  </article>;
                })}
              </div>
              <div className="section-head">
                <div><h2 className="section-title">Pour la prochaine manche</h2><p className="section-subtitle">Toute activation prend effet au tour suivant.</p></div>
              </div>
              <div className="extension-options">
                {(['extraSalt', 'extraPepper'] as ExtensionId[]).map((extension) => {
                  const label = extension === 'extraSalt' ? 'Extra Salt' : 'Extra Pepper';
                  const active = activeGame.extensions.includes(extension);
                  const queued = pendingExtensions.includes(extension);
                  return <button key={extension} className="toggle-chip" type="button" disabled={active} aria-pressed={queued || active} data-testid={`button-schedule-${extension}`} onClick={() => scheduleExtension(extension)}>
                    {queued || active ? <Check size={15} /> : <Plus size={15} />}{label}{queued ? ' · prévue' : active ? ' · active' : ''}
                  </button>;
                })}
              </div>
              <div className="game-bottom-bar">
                <button className="button button-secondary" type="button" data-testid="button-end-last-chance" onClick={() => requestEnd('lastChance')}>Dernière chance</button>
                <button className="button button-primary" type="button" disabled={activeRound.pepperEventId === 'diodon'} data-testid="button-end-stop" onClick={() => requestEnd('stop')}>Stopper la manche</button>
              </div>
            </main>
          ) : <main className="page">
            <section className="hero stagger">
              <div className="hero-copy">
                <div className="eyebrow">Le score, sans perdre le fil</div>
                <h1>La partie d’abord.<br />Les comptes, après.</h1>
                <p>Un compagnon simple pour suivre vos manches, vérifier les cartes et garder la table en mouvement.</p>
                <button className="button button-primary" type="button" data-testid="button-hero-create" onClick={() => document.getElementById('create-game')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Plus size={17} /> Créer une partie</button>
              </div>
            </section>
            <div className="section-head">
              <div><h2 className="section-title">On s’installe ?</h2><p className="section-subtitle">Deux à quatre joueurs, et vous êtes prêts.</p></div>
              <span className="pill">Fonctionne hors ligne</span>
            </div>
            <div className="feature-grid">
              <section className="panel create-panel stagger-2" id="create-game">
                <div className="panel-heading"><h2>Nouvelle partie</h2><span className="pill"><Users size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} /> {playersCount} joueurs</span></div>
                <div className="setup-row">
                  <span className="setup-label">Nombre de joueurs</span>
                  <div className="stepper">
                    <button type="button" aria-label="Retirer un joueur" data-testid="button-player-count-minus" disabled={playersCount <= 2} onClick={() => { setPlayersCount((count) => Math.max(2, count - 1)); setNames((current) => current.slice(0, -1)); }}><Minus size={17} /></button>
                    <strong data-testid="text-player-count">{playersCount}</strong>
                    <button type="button" aria-label="Ajouter un joueur" data-testid="button-player-count-plus" disabled={playersCount >= 4} onClick={() => { setPlayersCount((count) => Math.min(4, count + 1)); setNames((current) => [...current, '']); }}><Plus size={17} /></button>
                  </div>
                </div>
                <div className="player-inputs" style={{ marginTop: 15 }}>
                  {Array.from({ length: playersCount }, (_, index) => <label key={index}>
                    <span className="field-label">Joueur {index + 1}</span>
                    <input className="text-input" value={names[index] ?? ''} onChange={(event) => setNames((current) => current.map((name, i) => i === index ? event.target.value : name))} placeholder={`Nom du joueur ${index + 1}`} aria-label={`Nom du joueur ${index + 1}`} data-testid={`input-player-name-${index + 1}`} maxLength={24} />
                  </label>)}
                </div>
                <div className="extension-options" aria-label="Extensions de la partie">
                  {(['extraSalt', 'extraPepper'] as ExtensionId[]).map((extension) => {
                    const checked = extensions.includes(extension);
                    const label = extension === 'extraSalt' ? 'Extra Salt' : 'Extra Pepper';
                    return <button key={extension} className="toggle-chip" type="button" aria-pressed={checked} data-testid={`button-create-${extension}`} onClick={() => setExtensions((current) => checked ? current.filter((item) => item !== extension) : [...current, extension])}>
                      {checked ? <Check size={15} /> : <Plus size={15} />}{label}
                    </button>;
                  })}
                </div>
                <button className="button button-primary button-block" style={{ marginTop: 18 }} type="button" data-testid="button-create-game" onClick={createGame}><Anchor size={17} /> Démarrer la partie</button>
              </section>
              <section className="panel resume-panel stagger-3">
                <div className="panel-heading"><h2>Reprendre la table</h2><Clock3 size={18} color="hsl(var(--primary))" /></div>
                {games.filter((game) => game.status === 'inProgress').length ? <div className="match-list">
                  {games.filter((game) => game.status === 'inProgress').map((game) => <div className="match-row" key={game.id} data-testid={`row-match-${game.id}`}>
                    <div className="match-info"><div className="match-title">{game.players.map((player) => player.name).join(' · ')}</div><div className="match-meta">Manche {game.rounds.find((round) => round.status === 'inProgress')?.index ?? game.rounds.length} · {frenchDate(game.createdAt)}</div></div>
                    <button className="button button-secondary" style={{ minHeight: 42, padding: '0 13px', fontSize: 12 }} type="button" data-testid={`button-resume-${game.id}`} onClick={() => openGame(game)}>Reprendre <ChevronRight size={15} /></button>
                  </div>)}
                </div> : <div className="empty-box" data-testid="empty-resumable-games">Aucune partie en cours pour l’instant.<br />Votre table vous attend.</div>}
                <div className="helper-text" style={{ marginTop: 13 }}>Les parties enregistrées réapparaissent ici sur cet appareil.</div>
              </section>
            </div>
            <div className="quick-links">
              <button className="quick-link" type="button" data-testid="button-open-quick-count" onClick={() => setPanel('quickCount')}><span className="quick-icon"><Sparkles size={19} /></span><span>Comptage rapide<br /><span className="helper-text">Compter sans lancer de partie</span></span></button>
              <button className="quick-link" type="button" data-testid="button-open-history" onClick={() => setPanel('history')}><span className="quick-icon"><History size={19} /></span><span>Historique<br /><span className="helper-text">Retrouver les parties terminées</span></span></button>
              <Link href="/rules" className="quick-link" data-testid="link-open-rules"><span className="quick-icon"><BookOpen size={19} /></span><span>Aide des cartes<br /><span className="helper-text">Un doute ? Cherchez ici</span></span></Link>
            </div>
          </main>}
        </Route>
        <Route><main className="page"><div className="empty-box">Cette page n’existe pas. <Link href="/" data-testid="link-not-found-home">Revenir à l’accueil</Link></div></main></Route>
      </Switch>

      <nav className="bottom-nav" aria-label="Navigation mobile">
        <Link href="/" className={home ? 'active' : ''} data-testid="mobile-link-home"><Anchor size={19} /> Partie</Link>
        <Link href="/rules" className={location === '/rules' ? 'active' : ''} data-testid="mobile-link-rules"><BookOpen size={19} /> Règles</Link>
        <button type="button" data-testid="mobile-button-history" onClick={() => setPanel('history')}><History size={19} /> Historique</button>
        <button type="button" data-testid="mobile-button-count" onClick={() => setPanel('quickCount')}><Sparkles size={19} /> Compter</button>
      </nav>

      {panel === 'review' && activeGame && activeRound && <Modal title={reviewEndType === 'stop' ? 'Stopper la manche ?' : 'Dernière chance'} description="Relisez les saisies avant de confirmer. Le calcul final reste celui du moteur de score." onClose={() => setPanel(null)} testId="dialog-end-round">
        <div className="pending-note"><CircleHelp size={17} /> Simulation avant confirmation. Vérifiez les quantités et les règles de votre édition.</div>
        <div className="review-list" style={{ marginTop: 13 }}>
          <label className="field-label" style={{ display: 'block', marginBottom: 9 }}>
            Joueur qui termine la manche
            <select className="text-input" value={selectedEnderId} onChange={(event) => selectEnder(event.target.value)} aria-label="Joueur qui termine la manche" data-testid="select-round-ender">
              <option value="">Choisir un joueur</option>
              {activeGame.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select>
          </label>
          {activeGame.players.map((player) => {
            const preview = hasMatchingPreview
              ? endPreview?.scores[player.id]
              : undefined;
            return <div className="review-row" key={player.id} data-testid={`review-player-${player.id}`}><strong>{player.name}</strong><span>{preview !== undefined ? `Simulation : ${preview}` : activeRound.scores[player.id] !== undefined ? `Score actuel : ${activeRound.scores[player.id]}` : 'Score à calculer'}</span></div>;
          })}
        </div>
        {hasMatchingPreview && activeGame.players.map((player) => {
          const details = endPreview?.details?.[player.id];
          return details?.length ? <div className="score-details" key={player.id} data-testid={`score-details-${player.id}`}>
            <strong>{player.name}</strong>
            {details.map((line, index) => <div key={`${player.id}-${index}`}>{line}</div>)}
          </div> : null;
        })}
        {hasMatchingPreview && endPreview?.warnings?.map((warning, index) => <p className="pending-note" key={`${index}-${warning}`} data-testid={`status-preview-warning-${index}`}><CircleHelp size={17} /> {warning}</p>)}
        <p className="helper-text" style={{ marginTop: 13 }}>Aucun résultat n’est confirmé avant votre validation.</p>
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" data-testid="button-cancel-end-round" onClick={() => setPanel(null)}>Continuer la manche</button>
          <button className="button button-primary" type="button" disabled={!hasMatchingPreview || endPreview?.canConfirm === false || !selectedEnderId} data-testid="button-confirm-end-round" onClick={confirmEnd}><Check size={16} /> Confirmer</button>
        </div>
      </Modal>}

      {panel === 'history' && <Modal title="Historique" description="Vos parties terminées, pour retrouver le fil d’une soirée." onClose={() => setPanel(null)} wide testId="dialog-history">
        {games.filter((game) => game.status === 'finished').length ? <div className="match-list">
          {games.filter((game) => game.status === 'finished').map((game) => <div className="match-row" key={game.id} data-testid={`history-game-${game.id}`}><div className="match-info"><div className="match-title">{game.players.map((player) => player.name).join(' · ')}</div><div className="match-meta">{frenchDate(game.createdAt)} · {game.rounds.length} manches</div></div><span className="pill">Terminée</span></div>)}
        </div> : <div className="empty-box" data-testid="empty-game-history">Pas encore de partie terminée.<br />Les prochaines soirées s’ajouteront ici.</div>}
        <div className="dialog-actions"><button className="button button-secondary" type="button" data-testid="button-close-history" onClick={() => setPanel(null)}>Fermer</button></div>
      </Modal>}

      {panel === 'quickCount' && <Modal title="Comptage rapide" description="Un petit comptage autonome, sans créer de partie." onClose={() => setPanel(null)} wide testId="dialog-quick-count">
        <div className="count-sheet-grid">
          {cardTypes.filter((card) => !CARD_CATALOG.find((item) => item.id === card.id)?.extension).map((card) => <div className="count-sheet-row" key={card.id} data-testid={`quick-count-row-${card.id}`}>
            <strong>{card.name}</strong>
            <button className="count-button" type="button" aria-label={`Retirer une carte ${card.name}`} data-testid={`button-quick-decrement-${card.id}`} onClick={() => setQuickCounts((counts) => ({ ...counts, [card.id]: Math.max(0, (counts[card.id] ?? 0) - 1) }))}><Minus size={15} /></button>
            <span className="count-value" data-testid={`text-quick-count-${card.id}`}>{quickCounts[card.id] ?? 0}</span>
            <button className="count-button" type="button" aria-label={`Ajouter une carte ${card.name}`} data-testid={`button-quick-increment-${card.id}`} onClick={() => setQuickCounts((counts) => ({ ...counts, [card.id]: (counts[card.id] ?? 0) + 1 }))}><Plus size={15} /></button>
          </div>)}
        </div>
        <label className="color-count-entry">
          <span className="field-label">Couleurs des cartes · requis si vous comptez des sirènes</span>
          <input className="text-input" value={quickColorText} onChange={(event) => setQuickColorText(event.target.value)} placeholder="Ex. bleu: 3, jaune: 2" aria-label="Couleurs pour le comptage rapide" aria-invalid={quickColorText.trim() !== '' && quickColorCounts === null} data-testid="input-quick-color-counts" />
        </label>
        {quickColorText.trim() !== '' && quickColorCounts === null && <p className="validation-message" role="alert">Format attendu : bleu: 3, jaune: 2.</p>}
        <section className="quick-score-summary" aria-live="polite" data-testid="quick-score-summary">
          <div className="player-card-top"><strong>Score estimé · jeu de base</strong><span className="player-total">{quickScore.total ?? 'À vérifier'}</span></div>
          {quickScore.lines.map((line) => <div className="score-line" key={line.id}><span><strong>{line.label} · {line.quantity}</strong><small>{line.explanation}</small></span><strong>{line.points === null ? 'À vérifier' : `${line.points} pt${line.points === 1 ? '' : 's'}`}</strong></div>)}
          {quickScore.warnings.map((warning, index) => <p className="pending-note" key={`${index}-${warning}`}><CircleHelp size={16} /> {warning}</p>)}
        </section>
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" data-testid="button-reset-quick-count" onClick={() => { setQuickCounts({}); setQuickColorText(''); }}>Tout remettre à zéro</button>
          <button className="button button-secondary" type="button" data-testid="button-close-quick-count" onClick={() => setPanel(null)}>Terminer</button>
        </div>
      </Modal>}
    </div>
  );
}

export default App;
