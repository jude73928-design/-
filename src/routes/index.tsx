import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Kbd } from "@/components/Kbd";
import {
  buildDeck,
  chunkText,
  loadDeck,
  saveDeck,
  setActiveDeckId,
  upsertSavedDeckSync,
  type Deck,
} from "@/lib/flashcards";
import { LayoutDashboard } from "lucide-react";
import { PomodoroWidget } from "@/components/PomodoroWidget";
import { TextTranslateQuickBar } from "@/components/TextTranslateQuickBar";
import { playClick } from "@/lib/sounds";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "FlashCards — Spaced Repetition Study" },
      {
        name: "description",
        content:
          "Paste English or Arabic text and study with spaced repetition, TTS, and keyboard shortcuts.",
      },
    ],
  }),
});

function Home() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [maxWords, setMaxWords] = useState(40);
  const [existing, setExisting] = useState<Deck | null>(null);

  useEffect(() => {
    // Import shared deck from ?import=... link
    const params = new URLSearchParams(window.location.search);
    const imp = params.get("import");
    if (imp) {
      try {
        const b64 = imp.replace(/-/g, "+").replace(/_/g, "/");
        const json = decodeURIComponent(escape(atob(b64)));
        const { name, deck } = JSON.parse(json) as { name?: string; deck: Deck };
        saveDeck(deck);
        (async () => {
          const saved = await upsertSavedDeck(deck, name);
          setActiveDeckId(saved.id);
          navigate({ to: "/study" });
        })();
        return;
      } catch (e) {
        console.error("Import failed", e);
      }
    }
    const d = loadDeck();
    if (d) {
      setExisting(d);
      setText(d.sourceText);
      setMaxWords(d.maxWords);
      setName(d.name ?? "");
    }
  }, [navigate]);

  const previewCount = useMemo(
    () => (text.trim() ? chunkText(text, maxWords).length : 0),
    [text, maxWords],
  );

  const makeDeck = () =>
    existing && existing.sourceText === text && existing.maxWords === maxWords
      ? existing
      : { ...buildDeck(text, maxWords), name: name.trim() || undefined };

  // Read while studying: save to decks + open study instantly
  const startNew = () => {
    if (!text.trim()) return;
    playClick();
    const deck = makeDeck();
    const saved = upsertSavedDeckSync(deck, name.trim() || undefined);
    setActiveDeckId(saved.id);
    saveDeck(deck);
    setExisting(deck);
    navigate({ to: "/study" });
  };

  // Read without saving: study locally, not added to saved decks
  const readOnly = () => {
    if (!text.trim()) return;
    playClick();
    const deck = makeDeck();
    setActiveDeckId(null);
    saveDeck(deck);
    setExisting(deck);
    navigate({ to: "/study" });
  };

  // Save without reading: store in decks, stay here
  const saveOnly = () => {
    if (!text.trim()) return;
    playClick();
    const deck = makeDeck();
    upsertSavedDeckSync(deck, name.trim() || undefined);
    setExisting(deck);
    navigate({ to: "/dashboard" });
  };

  const reset = () => {
    saveDeck(null);
    setExisting(null);
    setText("");
  };

  const canContinue = existing && existing.cards.length > 0;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <h1 className="bg-gradient-to-r from-primary to-accent bg-clip-text text-5xl font-bold tracking-tight text-transparent">
            FlashCards
          </h1>
          <p className="mt-3 text-muted-foreground">
            Paste text in English or Arabic — study with spaced repetition
          </p>
        </header>

        <div className="mb-4 flex items-center justify-between gap-2">
          <PomodoroWidget />
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/dashboard" preload="intent">
              <LayoutDashboard className="size-4" />
              Saved Decks
            </Link>
          </Button>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-primary/5">
          <label className="mb-2 block text-sm font-medium text-foreground">
            Deck name (optional)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Surah Al-Kahf notes"
            className="mb-4 flex h-10 w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            dir="auto"
          />
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Your Text</label>
          </div>
          {text.trim() && (
            <TextTranslateQuickBar
              text={text}
              onTextChange={(newText) => setText(newText)}
              deckName={name}
              className="mb-3"
            />
          )}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste long-form text here. Supports English and Arabic."
            className="min-h-48 resize-y bg-input/40 text-base leading-relaxed"
            dir="auto"
          />

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-medium">Max words per unit</label>
              <span className="font-mono text-lg font-semibold text-primary">{maxWords}</span>
            </div>
            <Slider
              value={[maxWords]}
              onValueChange={(v) => setMaxWords(v[0])}
              min={10}
              max={120}
              step={5}
            />
          </div>

          <div className="mt-6 space-y-3">
            <Button
              onClick={startNew}
              disabled={!text.trim()}
              className="h-12 w-full text-base font-semibold"
            >
              {canContinue && existing?.sourceText === text && existing?.maxWords === maxWords
                ? "Continue Reading While Studying"
                : "Read While Studying (save + study)"}
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={readOnly}
                disabled={!text.trim()}
                variant="outline"
                className="h-11 flex-1"
              >
                Read Without Saving
              </Button>
              <Button
                onClick={saveOnly}
                disabled={!text.trim()}
                variant="outline"
                className="h-11 flex-1"
              >
                Save Without Reading
              </Button>
              <Button onClick={reset} variant="secondary" className="h-11 px-6">
                Reset
              </Button>
            </div>
          </div>

          {(previewCount > 0 || canContinue) && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>{previewCount} cards in deck · Progress saved locally</p>
              {existing?.lastStudiedIndex && existing.lastStudiedIndex > 0 ? (
                <p className="mt-1 text-xs font-medium text-primary">
                  Last stopped at Card {existing.lastStudiedIndex + 1} of {existing.cards.length}{" "}
                  (will prompt to continue or start over)
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-6">
          <h2 className="mb-4 text-sm font-semibold">Keyboard shortcuts during study:</h2>
          <ul className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li>
              <Kbd>Space</Kbd> — Read card aloud
            </li>
            <li>
              <Kbd>1</Kbd> — Hard (review tomorrow)
            </li>
            <li>
              <Kbd>2</Kbd> — Struggled (review soon)
            </li>
            <li>
              <Kbd>3</Kbd> — Good (normal interval)
            </li>
            <li>
              <Kbd>4</Kbd> — Easy (longer interval)
            </li>
            <li>
              <Kbd>Ctrl+Z</Kbd> — Undo (back to previous card)
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
