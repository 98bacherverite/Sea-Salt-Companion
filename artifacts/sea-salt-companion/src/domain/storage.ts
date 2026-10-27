import type { AppState } from "./types";

const DATABASE_NAME = "sea-salt-companion";
const DATABASE_VERSION = 1;
const STORE_NAME = "app-state";
const STATE_KEY = "root";

const EMPTY_STATE: AppState = {
  schemaVersion: 1,
  players: [],
  games: [],
  currentGameId: null,
};

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Le stockage local IndexedDB n’est pas disponible."));
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Impossible d’ouvrir le stockage local."));
    request.onblocked = () =>
      reject(new Error("Fermez les autres onglets Sea Salt Companion puis réessayez."));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Erreur de lecture du stockage local."));
  });
}

export async function loadAppState(): Promise<AppState> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const stored = await requestResult(
    transaction.objectStore(STORE_NAME).get(STATE_KEY),
  );
  if (!isAppState(stored)) return structuredClone(EMPTY_STATE);
  return stored;
}

export async function saveAppState(state: AppState): Promise<void> {
  if (!isAppState(state)) {
    throw new Error("Les données de partie ne respectent pas le format attendu.");
  }
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Impossible d’enregistrer la partie."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Enregistrement annulé."));
  });
}

export function exportAppState(state: AppState): string {
  return JSON.stringify(
    {
      format: "sea-salt-companion",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
}

export function importAppState(json: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Ce fichier n’est pas un JSON valide.");
  }
  const candidate =
    typeof parsed === "object" && parsed !== null && "data" in parsed
      ? (parsed as { data: unknown }).data
      : parsed;
  if (!isAppState(candidate)) {
    throw new Error("Ce fichier n’est pas un export Sea Salt Companion compatible.");
  }
  return candidate;
}

function isAppState(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Partial<AppState>;
  return (
    data.schemaVersion === 1 &&
    Array.isArray(data.players) &&
    Array.isArray(data.games) &&
    (data.currentGameId === null || typeof data.currentGameId === "string")
  );
}
