export type CardType = "question" | "quote" | "fact" | "note";

export const NEXT_TYPE_CYCLE: Record<CardType, CardType> = {
  fact: "question",
  note: "question",
  question: "quote",
  quote: "fact",
};

export type Card = {
  id: string;
  text: string;
  due: number; // timestamp ms
  interval: number; // days
  ease: number;
  reps: number;
  starred?: boolean;
  note?: string;
  cardType?: CardType;
};

export type Deck = {
  sourceText: string;
  maxWords: number;
  cards: Card[];
  name?: string;
  deckType?: "study" | "break"; // 'study' (default) or 'break'
  folderId?: string;
  deckNotes?: string;
  lastStudiedIndex?: number;
  lastCardId?: string;
};

const STORAGE_KEY = "flashcards-deck-v1";
const SETTINGS_KEY = "flashcards-settings-v1";
const DECKS_KEY = "flashcards-decks-v1";

export type SavedDeck = { id: string; name: string; deck: Deck; updatedAt: number };

import { supabase } from "@/integrations/supabase/client";
import { getAllIdbDecks, saveIdbDecks, deleteIdbDeck } from "./idb";

const isSupabaseConfigured = Boolean(
  typeof window !== "undefined" &&
  import.meta.env.VITE_SUPABASE_URL &&
  !String(import.meta.env.VITE_SUPABASE_URL).includes("placeholder"),
);

let memoryDecks: SavedDeck[] | null = null;
let isHydratingIdb = false;

function safeSupabaseSync<T>(action: PromiseLike<T> | Promise<T>, errorMessage?: string) {
  try {
    Promise.resolve(action).then(
      () => {},
      (err) => {
        if (errorMessage) {
          console.warn(errorMessage, err);
        }
      },
    );
  } catch (e) {
    if (errorMessage) {
      console.warn(errorMessage, e);
    }
  }
}

function readLocalDecks(): SavedDeck[] {
  if (typeof window === "undefined") return [];
  if (memoryDecks !== null) return memoryDecks;

  try {
    const raw = localStorage.getItem(DECKS_KEY);
    if (raw) {
      const arr: SavedDeck[] = JSON.parse(raw);
      memoryDecks = arr.sort((a, b) => b.updatedAt - a.updatedAt);
    } else {
      memoryDecks = [];
    }
  } catch {
    memoryDecks = [];
  }

  // Trigger background hydration from IndexedDB for any fuller data
  if (!isHydratingIdb) {
    isHydratingIdb = true;
    getAllIdbDecks()
      .then((idbDecks) => {
        if (idbDecks && idbDecks.length > 0) {
          const current = memoryDecks || [];
          if (current.length === 0 || idbDecks.length > current.length) {
            memoryDecks = dedupe([...current, ...idbDecks]);
          }
        }
      })
      .catch(() => {});
  }

  return memoryDecks || [];
}

function writeLocalDecks(decks: SavedDeck[]) {
  if (typeof window === "undefined") return;
  memoryDecks = decks;

  // Persist full decks reliably into IndexedDB (no 5MB quota cap)
  void saveIdbDecks(decks);

  // Safely persist to localStorage for instant synchronous warm boot:
  try {
    const raw = JSON.stringify(decks);
    // If under 2.5MB, store directly
    if (raw.length < 2.5 * 1024 * 1024) {
      localStorage.setItem(DECKS_KEY, raw);
    } else {
      // Store compact representation to stay well within browser localStorage limit
      const compact = decks.map((d) => ({
        id: d.id,
        name: d.name,
        updatedAt: d.updatedAt,
        deck: {
          ...d.deck,
          cards: (d.deck?.cards || []).slice(0, 10),
        },
      }));
      localStorage.setItem(DECKS_KEY, JSON.stringify(compact));
    }
  } catch {
    // If localStorage quota exceeded, save minimal summaries
    try {
      const minimal = decks.map((d) => ({
        id: d.id,
        name: d.name,
        updatedAt: d.updatedAt,
        deck: {
          name: d.name,
          sourceText: "",
          maxWords: d.deck?.maxWords || 30,
          cards: (d.deck?.cards || []).slice(0, 2),
        },
      }));
      localStorage.setItem(DECKS_KEY, JSON.stringify(minimal));
    } catch {
      // Fallback: full data is safe in IndexedDB
    }
  }
}

export function cleanNaturalText(text: string): string {
  if (!text) return "";
  return (
    text
      // Remove markdown headers: e.g. # Heading, ## Subheading, ### Note
      .replace(/(^|\n)\s*#{1,6}\s+/g, "$1")
      // Remove inline hashtags / hash prefixes before words or numbers: e.g. #1, #key, #fact
      .replace(/(^|\s)#+([a-zA-Z0-9_\u0600-\u06FF])/gu, "$1$2")
      // Remove any leftover hash characters
      .replace(/#+/g, "")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

function dedupe(decks: SavedDeck[]): SavedDeck[] {
  const seenId = new Set<string>();
  const seenName = new Map<string, SavedDeck>();
  const result: SavedDeck[] = [];

  // Sort by updatedAt descending to preserve freshest updates
  const sorted = [...decks]
    .filter((d) => Boolean(d && d.id && d.deck))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  for (const d of sorted) {
    if (seenId.has(d.id)) continue;

    const rawName = d.name || d.deck?.name || "Untitled Deck";
    const cleanName = cleanNaturalText(rawName) || "Untitled Deck";
    const normName = cleanName.trim().toLowerCase();

    if (seenName.has(normName)) {
      // Duplicate name detected, already kept the most recent version
      continue;
    }

    const cleanedDeck: Deck = {
      ...d.deck,
      name: cleanName,
      sourceText: cleanNaturalText(d.deck.sourceText || ""),
      cards: (d.deck.cards || []).map((c) => ({
        ...c,
        text: cleanNaturalText(c.text || ""),
        note: c.note ? cleanNaturalText(c.note) : undefined,
      })),
    };

    const entry: SavedDeck = {
      ...d,
      name: cleanName,
      deck: cleanedDeck,
    };

    seenName.set(normName, entry);
    seenId.add(d.id);
    result.push(entry);
  }

  return result;
}

export function listDecksCached(): SavedDeck[] {
  return dedupe(readLocalDecks());
}

export type SyncResult = {
  success: boolean;
  totalDecks: number;
  uploadedCount: number;
  downloadedCount: number;
  isCloud: boolean;
  timestamp: number;
};

export async function syncDecks(): Promise<SyncResult> {
  if (typeof window === "undefined") {
    return {
      success: false,
      totalDecks: 0,
      uploadedCount: 0,
      downloadedCount: 0,
      isCloud: false,
      timestamp: Date.now(),
    };
  }

  // Ensure IDB is read if memory is empty
  let localDecks = readLocalDecks();
  if (localDecks.length === 0) {
    try {
      const fromIdb = await getAllIdbDecks();
      if (fromIdb && fromIdb.length > 0) {
        localDecks = dedupe(fromIdb);
        writeLocalDecks(localDecks);
      }
    } catch {
      // ignore
    }
  }

  if (!isSupabaseConfigured) {
    const deduped = dedupe(localDecks);
    writeLocalDecks(deduped);
    return {
      success: true,
      totalDecks: deduped.length,
      uploadedCount: 0,
      downloadedCount: 0,
      isCloud: false,
      timestamp: Date.now(),
    };
  }

  try {
    // Step 1: Lightweight fetch of header metadata only (~5KB instead of 6MB!)
    // 5-second timeout ensures network hiccups never block the user
    const headerPromise = supabase
      .from("shared_decks")
      .select("id,name,updated_at")
      .order("updated_at", { ascending: false });

    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error("Supabase sync timeout") }), 5000),
    );

    const { data: remoteHeaders, error: headError } = await Promise.race([
      headerPromise,
      timeoutPromise,
    ]);
    if (headError) throw headError;

    const localById = new Map<string, SavedDeck>(localDecks.map((d) => [d.id, d]));
    const remoteHeadersList = (remoteHeaders ?? []) as Array<{
      id: string | number;
      name: string;
      updated_at: number | string;
    }>;

    // Identify which decks need downloading:
    // Missing locally OR remote updated_at is newer than local OR local has empty/compact cards
    const idsToDownload: string[] = [];
    const remoteHeaderMap = new Map<string, { id: string; name: string; updated_at: number }>();

    for (const rh of remoteHeadersList) {
      const rhId = String(rh.id);
      const rhTime = Number(rh.updated_at) || 0;
      remoteHeaderMap.set(rhId, { id: rhId, name: String(rh.name), updated_at: rhTime });

      const local = localById.get(rhId);
      if (
        !local ||
        rhTime > (local.updatedAt || 0) ||
        !local.deck?.cards ||
        local.deck.cards.length === 0
      ) {
        idsToDownload.push(rhId);
      }
    }

    let downloadedCount = 0;
    const downloadedMap = new Map<string, SavedDeck>();

    if (idsToDownload.length > 0) {
      // Fetch missing / updated decks
      const fetchDecksPromise =
        idsToDownload.length < 25
          ? supabase.from("shared_decks").select("id,name,deck,updated_at").in("id", idsToDownload)
          : supabase
              .from("shared_decks")
              .select("id,name,deck,updated_at")
              .order("updated_at", { ascending: false });

      const { data: downloadedData, error: dlErr } = await fetchDecksPromise;
      if (!dlErr && downloadedData) {
        for (const r of downloadedData as Array<Record<string, unknown>>) {
          const rId = String(r.id);
          let deckObj = r.deck as Deck;
          if (typeof deckObj === "string") {
            try {
              deckObj = JSON.parse(deckObj);
            } catch {
              continue;
            }
          }
          if (deckObj && Array.isArray(deckObj.cards)) {
            downloadedMap.set(rId, {
              id: rId,
              name: String(r.name || deckObj.name || "Untitled Deck"),
              deck: deckObj,
              updatedAt: Number(r.updated_at) || Date.now(),
            });
            downloadedCount++;
          }
        }
      }
    }

    // Merge logic
    let uploadedCount = 0;
    const mergedList: SavedDeck[] = [];
    const allIds = new Set([...localById.keys(), ...remoteHeaderMap.keys()]);

    for (const id of allIds) {
      const local = localById.get(id);
      const downloaded = downloadedMap.get(id);
      const remoteHeader = remoteHeaderMap.get(id);

      if (downloaded) {
        if (!local || downloaded.updatedAt >= (local.updatedAt || 0)) {
          mergedList.push(downloaded);
        } else {
          // Local is newer! Upload local to Supabase
          mergedList.push(local);
          safeSupabaseSync(
            supabase.from("shared_decks").upsert({
              id: local.id,
              name: local.name,
              deck: local.deck as unknown as Record<string, unknown>,
              updated_at: local.updatedAt,
            }),
            "Error updating remote deck with newer local data",
          );
          uploadedCount++;
        }
      } else if (local && !remoteHeader) {
        // Local only, upload to Supabase
        mergedList.push(local);
        safeSupabaseSync(
          supabase.from("shared_decks").upsert({
            id: local.id,
            name: local.name,
            deck: local.deck as unknown as Record<string, unknown>,
            updated_at: local.updatedAt,
          }),
          "Error syncing local deck to cloud",
        );
        uploadedCount++;
      } else if (local) {
        // We already have local and remote wasn't downloaded because local is up-to-date
        mergedList.push(local);
      }
    }

    const deduped = dedupe(mergedList);
    writeLocalDecks(deduped);

    return {
      success: true,
      totalDecks: deduped.length,
      uploadedCount,
      downloadedCount,
      isCloud: true,
      timestamp: Date.now(),
    };
  } catch (e) {
    console.warn("Cloud sync failed, falling back to local dedupe:", e);
    const deduped = dedupe(localDecks);
    writeLocalDecks(deduped);
    return {
      success: false,
      totalDecks: deduped.length,
      uploadedCount: 0,
      downloadedCount: 0,
      isCloud: false,
      timestamp: Date.now(),
    };
  }
}

export async function listDecks(): Promise<SavedDeck[]> {
  const result = await syncDecks();
  return listDecksCached();
}

export function createDeckFromStarred(sourceDeck: Deck, newName?: string): SavedDeck | null {
  const starredCards = (sourceDeck.cards || []).filter((c) => c.starred);
  if (starredCards.length === 0) return null;
  const now = Date.now();
  const name = newName || `${sourceDeck.name || "Deck"} (Starred)`;
  const deck: Deck = {
    sourceText: starredCards.map((c) => c.text).join("\n\n"),
    maxWords: sourceDeck.maxWords || 30,
    name,
    deckType: sourceDeck.deckType || "study",
    lastStudiedIndex: 0,
    cards: starredCards.map((c, idx) => ({
      ...c,
      id: `${now}-starred-${idx}`,
      reps: 0,
      interval: 0,
      due: now,
    })),
  };
  return {
    id: `d-starred-${now}`,
    name,
    deck,
    updatedAt: now,
  };
}

export function createDeckFromAllStarred(decks: SavedDeck[], newName?: string): SavedDeck | null {
  const allStarred: Card[] = [];
  for (const d of decks) {
    for (const c of d.deck?.cards || []) {
      if (c.starred) {
        allStarred.push(c);
      }
    }
  }
  if (allStarred.length === 0) return null;
  const now = Date.now();
  const name = newName || `All Starred Cards (${allStarred.length})`;
  const deck: Deck = {
    sourceText: allStarred.map((c) => c.text).join("\n\n"),
    maxWords: 30,
    name,
    deckType: "study",
    lastStudiedIndex: 0,
    cards: allStarred.map((c, idx) => ({
      ...c,
      id: `${now}-starred-all-${idx}`,
      reps: 0,
      interval: 0,
      due: now,
    })),
  };
  return {
    id: `d-starred-all-${now}`,
    name,
    deck,
    updatedAt: now,
  };
}

export function upsertSavedDeckSync(deck: Deck, name?: string, id?: string): SavedDeck {
  const decks = readLocalDecks();
  const rawName = name || deck.name || deck.sourceText.trim().split(/\s+/).slice(0, 8).join(" ");
  const cleanName = cleanNaturalText(rawName).slice(0, 80) || "Untitled Deck";
  const normName = cleanName.toLowerCase();
  const src = cleanNaturalText(deck.sourceText || "").trim();

  // Find existing deck by explicit ID, or existing name, or identical source text
  let existingIdx = id ? decks.findIndex((d) => d.id === id) : -1;
  if (existingIdx < 0) {
    existingIdx = decks.findIndex(
      (d) =>
        cleanNaturalText(d.name || "").toLowerCase() === normName ||
        (src && cleanNaturalText(d.deck?.sourceText ?? "").trim() === src),
    );
  }

  const cleanedDeck: Deck = {
    ...deck,
    name: cleanName,
    sourceText: src,
    cards: (deck.cards || []).map((c) => ({
      ...c,
      text: cleanNaturalText(c.text || ""),
      note: c.note ? cleanNaturalText(c.note) : undefined,
    })),
  };

  const entryId = existingIdx >= 0 ? decks[existingIdx].id : (id ?? `d-${Date.now()}`);
  const entry: SavedDeck = {
    id: entryId,
    name: cleanName,
    deck: cleanedDeck,
    updatedAt: Date.now(),
  };

  if (existingIdx >= 0) decks[existingIdx] = entry;
  else decks.unshift(entry);

  const deduped = dedupe(decks);
  writeLocalDecks(deduped);

  if (isSupabaseConfigured) {
    safeSupabaseSync(
      supabase.from("shared_decks").upsert({
        id: entry.id,
        name: entry.name,
        deck: entry.deck as unknown as Record<string, unknown>,
        updated_at: entry.updatedAt,
      }),
      "Error upserting saved deck",
    );
  }
  return entry;
}

export async function upsertSavedDeck(deck: Deck, name?: string, id?: string): Promise<SavedDeck> {
  return upsertSavedDeckSync(deck, name, id);
}

export async function deleteSavedDeck(id: string) {
  if (typeof window === "undefined") return;
  writeLocalDecks(readLocalDecks().filter((d) => d.id !== id));
  void deleteIdbDeck(id);
  if (isSupabaseConfigured) {
    safeSupabaseSync(
      supabase.from("shared_decks").delete().eq("id", id),
      "Error deleting saved deck",
    );
  }
}

export async function renameSavedDeck(id: string, name: string) {
  const decks = readLocalDecks();
  const idx = decks.findIndex((d) => d.id === id);
  if (idx < 0) return;
  const updated = { ...decks[idx], name: name.slice(0, 80) || "Untitled", updatedAt: Date.now() };
  decks[idx] = updated;
  writeLocalDecks(decks);
  if (isSupabaseConfigured) {
    safeSupabaseSync(
      supabase.from("shared_decks").upsert({
        id: updated.id,
        name: updated.name,
        deck: updated.deck as unknown as Record<string, unknown>,
        updated_at: updated.updatedAt,
      }),
      "Error renaming saved deck",
    );
  }
}

export function getSavedDeck(id: string): SavedDeck | null {
  return readLocalDecks().find((d) => d.id === id) ?? null;
}

const ACTIVE_ID_KEY = "flashcards-active-id-v1";
export function setActiveDeckId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_ID_KEY, id);
  else localStorage.removeItem(ACTIVE_ID_KEY);
}
export function getActiveDeckId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_ID_KEY);
}

// Normalize text for recall-mode comparison (case, punctuation, Arabic diacritics)
export function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // Arabic tashkeel + tatweel
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadDeck(): Deck | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDeck(deck: Deck | null) {
  if (typeof window === "undefined") return;
  if (deck === null) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  // Mirror updates into the saved-decks list if this deck is tracked there.
  const activeId = getActiveDeckId();
  if (activeId) {
    const decks = readLocalDecks();
    const idx = decks.findIndex((d) => d.id === activeId);
    if (idx >= 0) {
      const updated = { ...decks[idx], deck, updatedAt: Date.now() };
      decks[idx] = updated;
      writeLocalDecks(decks);
      if (isSupabaseConfigured) {
        safeSupabaseSync(
          supabase.from("shared_decks").upsert({
            id: updated.id,
            name: updated.name,
            deck: updated.deck as unknown as Record<string, unknown>,
            updated_at: updated.updatedAt,
          }),
          "Error saving deck update",
        );
      }
    }
  }
}

export type Settings = { wpm: number };
export function loadSettings(): Settings {
  if (typeof window === "undefined") return { wpm: 250 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { wpm: 250 };
  } catch {
    return { wpm: 250 };
  }
}
export function saveSettings(s: Settings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// Split text into chunks of <= maxWords, respecting paragraphs/sentences
export function chunkText(text: string, maxWords: number): string[] {
  const cleanInput = cleanNaturalText(text);
  const paragraphs = cleanInput
    .split(/\n\s*\n+/)
    .map((p) => cleanNaturalText(p))
    .filter(Boolean);
  const chunks: string[] = [];

  for (const p of paragraphs) {
    // Split by sentences (Arabic + English punctuation)
    const sentences = p
      .split(/(?<=[.!?؟。…])\s+|(?<=\n)/)
      .map((s) => cleanNaturalText(s))
      .filter(Boolean);

    let current: string[] = [];
    let currentCount = 0;
    for (const s of sentences) {
      const words = s.split(/\s+/).filter(Boolean);
      if (words.length > maxWords) {
        if (current.length) {
          chunks.push(current.join(" "));
          current = [];
          currentCount = 0;
        }
        for (let i = 0; i < words.length; i += maxWords) {
          chunks.push(words.slice(i, i + maxWords).join(" "));
        }
        continue;
      }
      if (currentCount + words.length > maxWords) {
        chunks.push(current.join(" "));
        current = words;
        currentCount = words.length;
      } else {
        current.push(s);
        currentCount += words.length;
      }
    }
    if (current.length) chunks.push(current.join(" "));
  }
  return chunks.map(cleanNaturalText).filter(Boolean);
}

export function detectCardType(text: string, note?: string): CardType {
  const n = (note || "").toLowerCase();
  if (n.includes("[question]")) return "question";
  if (n.includes("[quote]")) return "quote";
  if (n.includes("[fact]") || n.includes("[fact check]") || n.includes("[note]")) return "fact";

  const t = (text || "").trim();
  if (!t) return "fact";

  // Check quote: wrapped in quotes, starts with quotation marks, or starts with markdown quote '>'
  const startsWithQuote = /^["'“«「『>]/m.test(t);
  const endsWithQuote = /["'”»」』]\s*$/m.test(t);
  const hasAuthorAttribution = /\s+(?:—|--|-)\s+[A-Z\u0600-\u06FF]/.test(t);
  if (
    (startsWithQuote && endsWithQuote) ||
    /^> /m.test(t) ||
    (startsWithQuote && hasAuthorAttribution)
  ) {
    return "quote";
  }

  // Check question: English or Arabic question marks
  if (/[?؟]\s*$/m.test(t) || /^[¿?؟]/.test(t)) {
    return "question";
  }
  // English interrogative words
  if (
    /^(what|why|how|who|whom|whose|when|where|which|is|are|am|was|were|do|does|did|can|could|should|would|will|shall|may|might|must|define|explain|describe|calculate|name|list|give|identify)\b/i.test(
      t,
    )
  ) {
    return "question";
  }
  // Arabic interrogative particles
  if (/^(ما|ماذا|لماذا|كيف|من|أين|متى|كم|هل|أ|أي|أية)\s+/i.test(t)) {
    return "question";
  }

  return "fact";
}

export function getCardType(card?: Partial<Card> | null): CardType {
  if (!card) return "fact";
  if (card.cardType) {
    return card.cardType === "note" ? "fact" : card.cardType;
  }
  return detectCardType(card.text || "", card.note);
}

export function buildDeck(text: string, maxWords: number): Deck {
  const chunks = chunkText(text, maxWords);
  const now = Date.now();
  return {
    sourceText: text,
    maxWords,
    lastStudiedIndex: 0,
    cards: chunks.map((chunk, i) => ({
      id: `${now}-${i}`,
      text: chunk,
      due: now,
      interval: 0,
      ease: 2.5,
      reps: 0,
      cardType: detectCardType(chunk),
    })),
  };
}

// Grade: 1=Hard, 2=Struggled, 3=Good, 4=Easy
export function applyGrade(card: Card, grade: 1 | 2 | 3 | 4): Card {
  const next = { ...card, reps: card.reps + 1 };
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  switch (grade) {
    case 1: // Hard - tomorrow
      next.interval = 1;
      next.ease = Math.max(1.3, card.ease - 0.2);
      next.due = Date.now() + day;
      break;
    case 2: // Struggled - 4 hours
      next.interval = 0;
      next.ease = Math.max(1.3, card.ease - 0.1);
      next.due = Date.now() + 4 * hour;
      break;
    case 3: // Good - normal interval
      next.interval = card.interval < 1 ? 2 : Math.round(card.interval * card.ease);
      next.due = Date.now() + next.interval * day;
      break;
    case 4: // Easy - longer
      next.interval = card.interval < 1 ? 4 : Math.round(card.interval * card.ease * 1.4);
      next.ease = card.ease + 0.1;
      next.due = Date.now() + next.interval * day;
      break;
  }
  return next;
}

export function dueCards(deck: Deck, now = Date.now()): Card[] {
  return deck.cards.filter((c) => c.due <= now);
}

export function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export function formatDue(due: number): string {
  const diff = due - Date.now();
  if (diff <= 0) return "now";
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return `${Math.round(diff / (60 * 60 * 1000))}h`;
  return `${Math.round(diff / day)}d`;
}

export function parseImportedJsonData(jsonString: string): SavedDeck[] {
  try {
    const parsed = JSON.parse(jsonString);
    const rawDecks = Array.isArray(parsed) ? parsed : parsed.decks || [parsed];

    return rawDecks.map((item: Record<string, unknown>) => {
      const rawName = String(item.name || item.title || "Imported Deck");
      const name = cleanNaturalText(rawName) || "Imported Deck";
      // Auto-detect break deck tag from title if deckType wasn't explicitly set
      const isBreakByTitle = /\[break\]|\(break\)|break deck|break notes/i.test(name);
      const rawDeck = (item.deck || item) as Record<string, unknown>;
      const deckType: "study" | "break" =
        item.deckType === "break" || rawDeck.deckType === "break" || isBreakByTitle
          ? "break"
          : "study";

      const sourceText = cleanNaturalText(
        String(rawDeck.sourceText || item.rawText || item.sourceText || ""),
      );
      const rawCards = Array.isArray(rawDeck.cards || item.cards)
        ? ((rawDeck.cards || item.cards) as Card[])
        : [];
      const cards: Card[] = rawCards.map((c) => ({
        ...c,
        text: cleanNaturalText(c.text || ""),
        note: c.note ? cleanNaturalText(c.note) : undefined,
        cardType: c.cardType || detectCardType(c.text || "", c.note),
      }));

      const deck: Deck = {
        sourceText,
        maxWords: Number(rawDeck.maxWords || 30),
        cards,
        name,
        deckType,
        lastStudiedIndex: Number(rawDeck.lastStudiedIndex || 0),
      };

      return {
        id: String(
          item.id || `imported_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        ),
        name,
        deck,
        updatedAt: Date.now(),
      };
    });
  } catch (error) {
    console.error("Failed to parse imported deck JSON:", error);
    return [];
  }
}

export type StudyProgress = {
  deckId: string;
  index: number;
  totalCards: number;
  cardId?: string;
  updatedAt: number;
};

const PROGRESS_PREFIX = "flashcards-progress-v1-";

export function getProgressKey(deckId?: string | null): string {
  return `${PROGRESS_PREFIX}${deckId || "active"}`;
}

export function saveStudyProgress(
  deckId: string | null | undefined,
  index: number,
  totalCards: number,
  cardId?: string,
): void {
  if (typeof window === "undefined") return;
  const key = getProgressKey(deckId);
  const payload: StudyProgress = {
    deckId: deckId || "active",
    index,
    totalCards,
    cardId,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn("Failed to save study progress", e);
  }
}

export function getStudyProgress(deckId?: string | null): StudyProgress | null {
  if (typeof window === "undefined") return null;
  const key = getProgressKey(deckId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as StudyProgress;
  } catch {
    return null;
  }
}

export function clearStudyProgress(deckId?: string | null): void {
  if (typeof window === "undefined") return;
  const key = getProgressKey(deckId);
  localStorage.removeItem(key);
}
