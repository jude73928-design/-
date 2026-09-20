import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteSavedDeck,
  listDecks,
  listDecksCached,
  renameSavedDeck,
  saveDeck,
  setActiveDeckId,
  upsertSavedDeck,
  buildDeck,
  syncDecks,
  createDeckFromStarred,
  createDeckFromAllStarred,
  type SavedDeck,
} from "@/lib/flashcards";
import {
  ArrowLeft,
  Trash2,
  Play,
  Share2,
  Pencil,
  Copy,
  ChevronDown,
  ChevronRight,
  Star,
  Coffee,
  Upload,
  RotateCcw,
  Languages,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PomodoroWidget } from "@/components/PomodoroWidget";
import { BreakRestrictedComponent } from "@/components/BreakRestrictedComponent";
import { DeckLabelToggle } from "@/components/DeckLabelToggle";
import { ImportDeckModal } from "@/components/ImportDeckModal";
import { CardTypeDot } from "@/components/CardTypeDot";
import { FullTextTranslateModal } from "@/components/FullTextTranslateModal";
import { playClick } from "@/lib/sounds";

function encodeDeck(d: SavedDeck): string {
  const payload = JSON.stringify({ name: d.name, deck: d.deck });
  const b64 = btoa(unescape(encodeURIComponent(payload)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FlashCards" },
      { name: "description", content: "Your saved study decks." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [translatingDeck, setTranslatingDeck] = useState<SavedDeck | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [hasActiveDeck, setHasActiveDeck] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setHasActiveDeck(Boolean(localStorage.getItem("flashcards-deck-v1")));
    const cached = listDecksCached();
    if (cached.length > 0) {
      setDecks(cached);
      setIsLoading(false);
    }
    listDecks()
      .then((latest) => {
        if (latest && latest.length > 0) {
          setDecks(latest);
        }
      })
      .catch((err) => {
        console.warn("Background deck fetch error:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleSyncDecks = async () => {
    setIsSyncing(true);
    try {
      const res = await syncDecks();
      const updated = listDecksCached();
      setDecks(updated);
      if (res.isCloud) {
        setSyncStatus(
          `Sync complete: ${res.totalDecks} deck${res.totalDecks === 1 ? "" : "s"} synced (${res.uploadedCount} uploaded, ${res.downloadedCount} downloaded).`,
        );
      } else {
        setSyncStatus(
          `Sync complete: ${res.totalDecks} deck${res.totalDecks === 1 ? "" : "s"} updated locally.`,
        );
      }
      setTimeout(() => setSyncStatus(null), 6000);
    } catch (err) {
      console.warn("Failed to sync decks", err);
      setSyncStatus("Sync failed. Stored locally.");
    } finally {
      setIsSyncing(false);
    }
  };

  const open = (d: SavedDeck) => {
    playClick();
    setActiveDeckId(d.id);
    saveDeck(d.deck);
    navigate({ to: "/study" });
  };

  const remove = async (id: string) => {
    await deleteSavedDeck(id);
    setDecks(listDecksCached());
  };

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      prompt("Copy:", t);
    }
  };

  const saveRename = async (id: string) => {
    await renameSavedDeck(id, editName.trim());
    setEditId(null);
    setDecks(await listDecks());
  };

  const handleUpdateDeck = (updated: SavedDeck) => {
    setDecks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleApplyTranslatedDeck = async (translatedText: string, targetLang: string) => {
    if (!translatingDeck) return;
    const newDeck = buildDeck(translatedText, translatingDeck.deck.maxWords || 30);
    const langLabel = targetLang === "ar" ? "(Arabic)" : "(English)";
    await upsertSavedDeck(newDeck, `${translatingDeck.name} ${langLabel}`);
    setDecks(listDecksCached());
    listDecks().then(setDecks);
    setTranslatingDeck(null);
  };

  const handleMakeStarredDeck = async (targetDeck: SavedDeck) => {
    const newEntry = createDeckFromStarred(targetDeck.deck);
    if (!newEntry) {
      alert("No starred cards found in this deck! Star some cards first.");
      return;
    }
    await upsertSavedDeck(newEntry.deck, newEntry.name, newEntry.id);
    const fresh = await listDecks();
    setDecks(fresh);
    const shouldStudyNow = window.confirm(
      `Created "${newEntry.name}" with ${newEntry.deck.cards.length} starred cards!\n\nWould you like to study this deck now?`,
    );
    if (shouldStudyNow) {
      open(newEntry);
    }
  };

  const handleMakeAllStarredDeck = async () => {
    const newEntry = createDeckFromAllStarred(decks);
    if (!newEntry) {
      alert(
        "No starred cards found across any decks! Star cards during study sessions to create custom review decks.",
      );
      return;
    }
    await upsertSavedDeck(newEntry.deck, newEntry.name, newEntry.id);
    const fresh = await listDecks();
    setDecks(fresh);
    const shouldStudyNow = window.confirm(
      `Created "${newEntry.name}" with ${newEntry.deck.cards.length} starred cards from across all your decks!\n\nWould you like to study this deck now?`,
    );
    if (shouldStudyNow) {
      open(newEntry);
    }
  };

  const totalStarredAcrossAll = decks.reduce(
    (acc, d) => acc + (d.deck?.cards || []).filter((c) => c.starred).length,
    0,
  );

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="gap-2 px-2 text-muted-foreground hover:text-foreground"
            >
              <Link to="/" preload="intent">
                <ArrowLeft className="size-4" />
                Home
              </Link>
            </Button>
            {isMounted && hasActiveDeck && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5 px-2.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
              >
                <Link to="/study" preload="intent">
                  <Play className="size-3.5 fill-primary" />
                  Resume Study
                </Link>
              </Button>
            )}
          </div>

          <PomodoroWidget />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Saved Decks</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isMounted
                ? `${decks.length} deck${decks.length === 1 ? "" : "s"} saved · Cloud sync supported`
                : "Saved study decks · Cloud sync supported"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isMounted && totalStarredAcrossAll > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleMakeAllStarredDeck}
                className="gap-1.5 h-8 border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-xs font-semibold"
                title={`Create a single deck out of all ${totalStarredAcrossAll} starred cards across all decks`}
              >
                <Star className="size-3.5 fill-amber-500" />
                <span>All Starred ({totalStarredAcrossAll})</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncDecks}
              disabled={isSyncing}
              className="gap-1.5 h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 font-semibold"
              title="Sync decks between local storage and cloud database"
            >
              <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
              <span>{isSyncing ? "Syncing..." : "Sync Decks"}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setIsImportOpen(true)}
              className="gap-1.5 h-8 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <Upload className="size-3.5" /> Import Deck
            </Button>
          </div>
        </div>

        {syncStatus && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs text-primary shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <RefreshCw className="size-3.5 shrink-0" />
              <span>{syncStatus}</span>
            </div>
            <button
              onClick={() => setSyncStatus(null)}
              className="text-primary/70 hover:text-primary font-bold text-xs p-1"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <ImportDeckModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onImportComplete={async () => {
            setDecks(await listDecks());
          }}
        />

        {/* Break Restricted Zone */}
        <div className="mb-6">
          <BreakRestrictedComponent
            title="Break Decks & Casual Review"
            description="During your Pomodoro break, enjoy lightweight review mode or take quick notes without impacting SRS memory queues!"
          >
            <div className="p-3 bg-slate-900/60 rounded-lg border border-emerald-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-emerald-400" />
                <div>
                  <h5 className="text-xs font-semibold text-emerald-200">Break Refresh Activity</h5>
                  <p className="text-[11px] text-slate-400">
                    Casual flashcard flip or light reading unlocked!
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                onClick={() => navigate({ to: "/study" })}
              >
                Relaxed Study
              </Button>
            </div>
          </BreakRestrictedComponent>
        </div>

        {!isMounted || (isLoading && decks.length === 0) ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center flex flex-col items-center justify-center gap-3">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              Loading your study decks...
            </span>
          </div>
        ) : decks.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
            No decks yet. Create one from the home page.
          </div>
        ) : (
          <ul className="space-y-3">
            {decks.map((d) => {
              const due = d.deck.cards.filter((c) => c.due <= Date.now()).length;
              const deckStarredCount = (d.deck?.cards || []).filter((c) => c.starred).length;
              const isOpen = openId === d.id;
              return (
                <li
                  key={d.id}
                  className="group rounded-2xl border border-border bg-card p-3.5 sm:p-4 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(isOpen ? null : d.id);
                        }}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted cursor-pointer"
                        title="Show cards"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => {
                          if (editId !== d.id) open(d);
                        }}
                      >
                        {editId === d.id ? (
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => saveRename(d.id)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename(d.id);
                              if (e.key === "Escape") setEditId(null);
                            }}
                            className="w-full rounded-md border border-input bg-input/40 px-2 py-1 text-sm font-semibold"
                            dir="auto"
                          />
                        ) : (
                          <h3
                            className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors break-words leading-tight cursor-pointer"
                            dir="auto"
                            title={`Click to study "${d.name}"`}
                          >
                            {d.name || "Untitled Deck"}
                          </h3>
                        )}
                        <div
                          className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>
                            {d.deck.cards.length} cards · {due} due ·{" "}
                            {new Date(d.updatedAt).toLocaleDateString()}
                          </span>
                          {deckStarredCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                              <Star className="size-2.5 fill-amber-500" />
                              {deckStarredCount} starred
                            </span>
                          )}
                          {d.deck.lastStudiedIndex && d.deck.lastStudiedIndex > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              <RotateCcw className="size-2.5" /> Stopped at card{" "}
                              {d.deck.lastStudiedIndex + 1}/{d.deck.cards.length}
                            </span>
                          ) : null}
                          <DeckLabelToggle savedDeck={d} onUpdateDeck={handleUpdateDeck} />
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between sm:justify-end gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        onClick={() => open(d)}
                        className="gap-1.5 font-semibold text-xs h-8 px-3"
                      >
                        <Play className="size-3.5 fill-current" /> Study
                      </Button>
                      {deckStarredCount > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMakeStarredDeck(d)}
                          className="gap-1 font-semibold text-xs h-8 px-2.5 border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                          title={`Make a new deck from ${deckStarredCount} starred cards`}
                        >
                          <Star className="size-3.5 fill-amber-500" />
                          <span className="hidden sm:inline">Make Starred Deck</span>
                          <span className="sm:hidden">Starred</span>
                          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold">
                            {deckStarredCount}
                          </span>
                        </Button>
                      )}
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditId(d.id);
                            setEditName(d.name);
                          }}
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          title="Rename"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTranslatingDeck(d)}
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          title="Translate deck (EN ↔ AR)"
                        >
                          <Languages className="size-3.5 text-primary" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyText(d.deck.cards.map((c) => c.text).join("\n\n"))}
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          title="Copy all cards"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const url = `${window.location.origin}/?import=${encodeDeck(d)}`;
                            try {
                              await navigator.clipboard.writeText(url);
                              alert("Share link copied to clipboard");
                            } catch {
                              prompt("Copy this link:", url);
                            }
                          }}
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          title="Copy share link"
                        >
                          <Share2 className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(d.id)}
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          title="Delete deck"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <ul className="mt-3 space-y-2 border-t border-border pt-3">
                      {d.deck.cards.map((c, i) => (
                        <li
                          key={c.id}
                          className="flex items-start gap-2 rounded-md bg-muted/30 p-2 text-sm"
                        >
                          <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground pt-0.5">
                            {i + 1}.
                          </span>
                          <CardTypeDot card={c} editable={false} className="shrink-0 scale-90" />
                          <div className="min-w-0 flex-1">
                            <div dir="auto" className="whitespace-pre-wrap break-words">
                              {c.starred && (
                                <Star className="mr-1 inline size-3 fill-yellow-500 text-yellow-500" />
                              )}
                              {c.text}
                            </div>
                            {c.note && (
                              <div className="mt-1 text-xs text-muted-foreground" dir="auto">
                                📝 {c.note}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              copyText(c.note ? `${c.text}\n\nNote: ${c.note}` : c.text)
                            }
                            className="h-7 shrink-0 px-2 text-muted-foreground hover:text-foreground"
                            title="Copy this card"
                          >
                            <Copy className="size-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {translatingDeck && (
        <FullTextTranslateModal
          isOpen={true}
          onClose={() => setTranslatingDeck(null)}
          initialText={
            translatingDeck.deck.sourceText ||
            translatingDeck.deck.cards.map((c) => c.text).join("\n\n")
          }
          deckName={translatingDeck.name}
          onApplyTranslation={handleApplyTranslatedDeck}
        />
      )}
    </main>
  );
}
