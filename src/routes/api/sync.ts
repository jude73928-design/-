import { createFileRoute } from "@tanstack/react-router";

interface SyncPayload {
  decks?: any[];
  folders?: any[];
  timestamp?: number;
}

// In-memory master store
let serverDecks: any[] = [];
let serverFolders: any[] = [];
let isLoadedFromFile = false;

async function ensureLoaded() {
  if (isLoadedFromFile || typeof window !== "undefined") return;
  isLoadedFromFile = true;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dataDir = path.join(process.cwd(), ".data");
    const storeFile = path.join(dataDir, "sync_store.json");
    if (fs.existsSync(storeFile)) {
      const raw = fs.readFileSync(storeFile, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.decks)) serverDecks = parsed.decks;
      if (Array.isArray(parsed.folders)) serverFolders = parsed.folders;
    }
  } catch (err) {
    console.warn("[Server Sync] Could not read sync_store.json:", err);
  }
}

async function persistToFile() {
  if (typeof window !== "undefined") return;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dataDir = path.join(process.cwd(), ".data");
    const storeFile = path.join(dataDir, "sync_store.json");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(
      storeFile,
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
  await ensureLoaded();

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
    await persistToFile();
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
