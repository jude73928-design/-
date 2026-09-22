import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";

interface SyncPayload {
  decks?: any[];
  folders?: any[];
  timestamp?: number;
}

// In-memory master store
let serverDecks: any[] = [];
let serverFolders: any[] = [];
let isLoadedFromFile = false;

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "sync_store.json");

function ensureLoaded() {
  if (isLoadedFromFile) return;
  isLoadedFromFile = true;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.decks)) serverDecks = parsed.decks;
      if (Array.isArray(parsed.folders)) serverFolders = parsed.folders;
    }
  } catch (err) {
    console.warn("[Server Sync] Could not read sync_store.json:", err);
  }
}

function persistToFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ decks: serverDecks, folders: serverFolders, updatedAt: Date.now() }, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[Server Sync] Could not write sync_store.json:", err);
  }
}

function dedupeDecks(list: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of list) {
    if (!item || !item.id) continue;
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function dedupeFolders(list: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of list) {
    if (!item || !item.id) continue;
    const existing = map.get(item.id);
    if (!existing || (item.createdAt || 0) >= (existing.createdAt || 0)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function handleSync(request: Request): Promise<Response> {
  ensureLoaded();

  let clientPayload: SyncPayload = {};
  if (request.method === "POST") {
    try {
      clientPayload = await request.json();
    } catch {
      clientPayload = {};
    }
  }

  const clientDecks = Array.isArray(clientPayload.decks) ? clientPayload.decks : [];
  const clientFolders = Array.isArray(clientPayload.folders) ? clientPayload.folders : [];

  if (clientDecks.length > 0) {
    serverDecks = dedupeDecks([...serverDecks, ...clientDecks]);
  }
  if (clientFolders.length > 0) {
    serverFolders = dedupeFolders([...serverFolders, ...clientFolders]);
  }

  if (clientDecks.length > 0 || clientFolders.length > 0) {
    persistToFile();
  }

  return new Response(
    JSON.stringify({
      success: true,
      decks: serverDecks,
      folders: serverFolders,
      timestamp: Date.now(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}

export const Route = createFileRoute("/api/sync")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handleSync(request),
      POST: async ({ request }: { request: Request }) => handleSync(request),
    },
  },
} as never);
