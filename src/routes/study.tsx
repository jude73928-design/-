import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Kbd } from "@/components/Kbd";
import { cn } from "@/lib/utils";
import {
  applyGrade,
  buildDeck,
  dueCards,
  formatDue,
  isArabic,
  loadDeck,
  normalizeForCompare,
  saveDeck,
  getActiveDeckId,
  setActiveDeckId,
  saveStudyProgress,
  getStudyProgress,
  clearStudyProgress,
  upsertSavedDeck,
  createDeckFromStarred,
  type Card,
  type Deck,
  type CardType,
  NEXT_TYPE_CYCLE,
  getCardType,
  cleanNaturalText,
} from "@/lib/flashcards";
import { Textarea } from "@/components/ui/textarea";
import {
  speak as ttsSpeak,
  detectLang,
  prefetchTts,
  type TtsHandle,
  type TtsEndReason,
} from "@/lib/tts";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Loader2,
  Star,
  Copy,
  StickyNote,
  PanelRight,
  X,
  Languages,
  Plus,
  RotateCcw,
  BookmarkCheck,
  Sparkles,
  Check,
  LayoutDashboard,
  Undo2,
  Volume2,
  Eye,
  Settings2,
  Pencil,
} from "lucide-react";
import { playClick, playCorrect, playClimax } from "@/lib/sounds";
import { PomodoroWidget } from "@/components/PomodoroWidget";
import { CardTypeDot } from "@/components/CardTypeDot";
import { translatePhrase } from "@/services/translator";
import { FullTextTranslateModal } from "@/components/FullTextTranslateModal";
import { HoldButton } from "@/components/HoldButton";
import { WriteRepeatModal } from "@/components/WriteRepeatModal";
import { QuickQuestionNoteModal } from "@/components/QuickQuestionNoteModal";

export const Route = createFileRoute("/study")({
  component: Study,
  head: () => ({
    meta: [
      { title: "Study — FlashCards" },
      { name: "description", content: "Study mode with instant responsiveness and TTS." },
    ],
  }),
});

const SPEED_PRESETS = [150, 250, 350, 500, 650, 800];
const TAGS = ["Question", "Note", "Important", "Idea"];

const parseNote = (note?: string) => {
  const m = (note ?? "").match(/^((?:\[[^\]]+\])+)\s*/);
  const tags = m ? Array.from(m[1].matchAll(/\[([^\]]+)\]/g)).map((x) => x[1]) : [];
  return { tags, body: (note ?? "").slice(m ? m[0].length : 0) };
};

const buildNote = (tags: string[], body: string) =>
  `${tags.map((t) => `[${t}]`).join("")}${tags.length ? " " : ""}${body}`;

const noteToText = (text: string, note?: string) => {
  const { tags, body } = parseNote(note);
  return [tags.length ? tags.join(" · ") : "", text, body ? `Note: ${body}` : ""]
    .filter(Boolean)
    .join("\n");
};

function Study() {
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<{ prevCard: Card; deck: Deck }[]>([]);
  const [resumePrompt, setResumePrompt] = useState<{ stoppedIndex: number; total: number } | null>(
    null,
  );
  const [wpm, setWpm] = useState(250);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [recallMode, setRecallMode] = useState(false);
  const [playsCount, setPlaysCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const handleRef = useRef<TtsHandle | null>(null);
  const playReqRef = useRef(0);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // 3x Writing Practice Modal State
  const [practiceWord, setPracticeWord] = useState<string | null>(null);

  // Quick Question/Note/Quote Modal State (with auto-focus keyboard and skip)
  const [questionNoteModalOpen, setQuestionNoteModalOpen] = useState(false);
  const [targetModalType, setTargetModalType] = useState<CardType | undefined>(undefined);

  const [freeNotes, setFreeNotes] = useState<{ id: string; text: string }[]>([]);
  // Card-only translation state
  const [cardTranslations, setCardTranslations] = useState<
    Record<string, { text: string; targetLang: "ar" | "en"; alternatives?: string[] }>
  >({});
  const [cardViewMode, setCardViewMode] = useState<"original" | "translated">("original");
  const [activeCardTargetLang, setActiveCardTargetLang] = useState<"ar" | "en">("ar");
  const [isTranslatingCard, setIsTranslatingCard] = useState(false);
  const [isDeckTranslateOpen, setIsDeckTranslateOpen] = useState(false);
  const currentTextRef = useRef("");

  const loadLocalNotes = useCallback(() => {
    try {
      const raw = localStorage.getItem("flashcards-freenotes-v1");
      if (raw) setFreeNotes(JSON.parse(raw));
    } catch (e) {
      console.warn("Failed to load freenotes", e);
    }
  }, []);

  useEffect(() => {
    loadLocalNotes();
    const handleNotesSync = () => loadLocalNotes();
    window.addEventListener("flashcards-notes-changed", handleNotesSync);
    return () => window.removeEventListener("flashcards-notes-changed", handleNotesSync);
  }, [loadLocalNotes]);

  const saveFreeNotes = (n: { id: string; text: string }[]) => {
    setFreeNotes(n);
    try {
      localStorage.setItem("flashcards-freenotes-v1", JSON.stringify(n));
      window.dispatchEvent(new CustomEvent("flashcards-notes-changed"));
    } catch (e) {
      console.warn("Failed to save freenotes", e);
    }
  };

  const stopSpeech = useCallback(() => {
    playReqRef.current++;
    handleRef.current?.stop();
    handleRef.current = null;
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(
    async (text: string, forceLang?: "ar" | "en"): Promise<TtsEndReason> => {
      const reqId = ++playReqRef.current;
      handleRef.current?.stop();
      handleRef.current = null;
      setIsLoading(true);
      try {
        const lang = forceLang || detectLang(text);
        const handle = await ttsSpeak(text, lang, wpm, () => {
          if (playReqRef.current === reqId) setIsPlaying(false);
        });
        if (playReqRef.current !== reqId) {
          handle.stop();
          return "stopped";
        }
        handleRef.current = handle;
        setIsLoading(false);
        setIsPlaying(true);
        const reason = await handle.ended;
        if (playReqRef.current === reqId) {
          setIsPlaying(false);
          setIsLoading(false);
        }
        return reason;
      } catch (e) {
        console.error("TTS failed", e);
        if (playReqRef.current === reqId) {
          setIsLoading(false);
          setIsPlaying(false);
        }
        return "stopped";
      }
    },
    [wpm],
  );

  const current = queue[index];
  const total = queue.length;
  const done = Boolean(deck && total > 0 && index >= total);

  const activeTranslation = current
    ? cardTranslations[`${current.id}::${activeCardTargetLang}`]
    : null;

  const handleTranslateCardOnly = useCallback(
    async (targetLang: "ar" | "en") => {
      if (!current) return;
      playClick();
      setActiveCardTargetLang(targetLang);

      const cacheKey = `${current.id}::${targetLang}`;
      if (cardTranslations[cacheKey]) {
        setCardViewMode("translated");
        return;
      }

      setIsTranslatingCard(true);
      try {
        const res = await translatePhrase(current.text, { forceTargetLang: targetLang });
        const entry = {
          text: res.text,
          targetLang: res.targetLang,
          alternatives: res.alternatives,
        };
        setCardTranslations((prev) => ({
          ...prev,
          [cacheKey]: entry,
        }));
        setCardViewMode("translated");
        prefetchTts(res.text, res.targetLang);
      } catch (e) {
        console.error("Card translation failed", e);
      } finally {
        setIsTranslatingCard(false);
      }
    },
    [current, cardTranslations],
  );

  const handleSwitchBackToOriginal = useCallback(() => {
    playClick();
    setCardViewMode("original");
  }, []);

  const handleToggleCardTranslate = useCallback(() => {
    if (!current) return;
    if (cardViewMode === "translated") {
      handleSwitchBackToOriginal();
      return;
    }
    const currentLang = detectLang(current.text);
    const targetLang = currentLang === "ar" ? "en" : "ar";
    void handleTranslateCardOnly(targetLang);
  }, [current, cardViewMode, handleSwitchBackToOriginal, handleTranslateCardOnly]);

  const handleStartFromBeginning = useCallback(() => {
    stopSpeech();
    setIndex(0);
    setHistory([]);
    const activeId = getActiveDeckId();
    saveStudyProgress(activeId, 0, queue.length, queue[0]?.id);
    const stored = loadDeck();
    if (stored) {
      stored.lastStudiedIndex = 0;
      saveDeck(stored);
    }
    setResumePrompt(null);
  }, [queue, stopSpeech]);

  const handleContinueStopped = useCallback(() => {
    if (resumePrompt) {
      setIndex(resumePrompt.stoppedIndex);
      setResumePrompt(null);
    }
  }, [resumePrompt]);

  useEffect(() => {
    currentTextRef.current = current?.text ?? "";
  }, [current?.text]);

  const replay = useCallback(() => {
    if (!current) return;
    setPlaysCount((c) => c + 1);
    if (cardViewMode === "translated" && activeTranslation) {
      void speak(activeTranslation.text, activeTranslation.targetLang);
    } else {
      void speak(current.text);
    }
  }, [current, cardViewMode, activeTranslation, speak]);

  const togglePlay = useCallback(() => {
    if (!current) return;
    if (isPlaying || isLoading) stopSpeech();
    else {
      setPlaysCount((c) => c + 1);
      if (cardViewMode === "translated" && activeTranslation) {
        void speak(activeTranslation.text, activeTranslation.targetLang);
      } else {
        void speak(current.text);
      }
    }
  }, [current, isPlaying, isLoading, speak, stopSpeech, cardViewMode, activeTranslation]);

  const switchAndAdvance = useCallback(
    (targetType?: CardType) => {
      if (!deck || !current) return;
      playClick();
      stopSpeech();

      const currentType = getCardType(current);
      const newType = targetType || NEXT_TYPE_CYCLE[currentType] || "question";

      const updatedCurrent: Card = { ...current, cardType: newType };
      const nextIndex = index + 1;

      const newCards = deck.cards.map((c) => (c.id === current.id ? updatedCurrent : c));
      if (nextIndex < newCards.length && !newCards[nextIndex].cardType) {
        newCards[nextIndex] = {
          ...newCards[nextIndex],
          cardType: "fact",
        };
      }

      const newDeck = { ...deck, cards: newCards, lastStudiedIndex: nextIndex };
      setHistory((h) => [...h, { prevCard: current, deck }]);
      setDeck(newDeck);
      saveDeck(newDeck);
      setQueue((q) => {
        const nextQueue = q.map((c) => (c.id === current.id ? updatedCurrent : c));
        if (nextIndex < nextQueue.length && !nextQueue[nextIndex].cardType) {
          nextQueue[nextIndex] = { ...nextQueue[nextIndex], cardType: "fact" };
        }
        return nextQueue;
      });
      setIndex(nextIndex);
      const activeId = getActiveDeckId();
      saveStudyProgress(activeId, nextIndex, queue.length, queue[nextIndex]?.id);
    },
    [deck, current, stopSpeech, index, queue],
  );

  const grade = useCallback(
    (g: 1 | 2 | 3 | 4) => {
      if (!deck || !current) return;
      playClick();
      stopSpeech();
      const currentType = current.cardType || getCardType(current) || "fact";
      const updatedCard: Card = { ...applyGrade(current, g), cardType: currentType };
      const nextIndex = index + 1;
      const newCards = deck.cards.map((c) => (c.id === current.id ? updatedCard : c));

      if (nextIndex < newCards.length && !newCards[nextIndex].cardType) {
        newCards[nextIndex] = {
          ...newCards[nextIndex],
          cardType: "fact",
        };
      }

      const newDeck = { ...deck, cards: newCards, lastStudiedIndex: nextIndex };
      setHistory((h) => [...h, { prevCard: current, deck }]);
      setDeck(newDeck);
      saveDeck(newDeck);
      setQueue((q) => {
        const nextQueue = q.map((c) => (c.id === current.id ? updatedCard : c));
        if (nextIndex < nextQueue.length && !nextQueue[nextIndex].cardType) {
          nextQueue[nextIndex] = { ...nextQueue[nextIndex], cardType: "fact" };
        }
        return nextQueue;
      });
      setIndex(nextIndex);
      const activeId = getActiveDeckId();
      saveStudyProgress(activeId, nextIndex, queue.length, queue[nextIndex]?.id);
    },
    [deck, current, stopSpeech, index, queue],
  );

  const undo = useCallback(() => {
    playClick();
    stopSpeech();
    if (history.length > 0) {
      const last = history[history.length - 1];
      setDeck(last.deck);
      saveDeck(last.deck);
      setHistory((h) => h.slice(0, -1));
      const prevIndex = Math.max(0, index - 1);
      setIndex(prevIndex);
      const activeId = getActiveDeckId();
      saveStudyProgress(activeId, prevIndex, queue.length, queue[prevIndex]?.id);
    } else if (index > 0) {
      const prevIndex = index - 1;
      setIndex(prevIndex);
      const activeId = getActiveDeckId();
      saveStudyProgress(activeId, prevIndex, queue.length, queue[prevIndex]?.id);
    }
  }, [history, stopSpeech, index, queue]);

  const starredCardsCount = useMemo(() => deck?.cards.filter((c) => c.starred).length ?? 0, [deck]);
  const totalNotesCount = useMemo(() => {
    const cardNotes = deck?.cards.filter((c) => c.note && c.note.trim()).length ?? 0;
    return cardNotes + freeNotes.length;
  }, [deck, freeNotes]);

  const handleMakeStarredDeck = useCallback(async () => {
    if (!deck) return;
    const newEntry = createDeckFromStarred(deck);
    if (!newEntry) {
      alert("No starred cards in this deck yet! Tap the star icon (⭐) on any card to star it.");
      return;
    }
    await upsertSavedDeck(newEntry.deck, newEntry.name, newEntry.id);
    const shouldStudy = window.confirm(
      `Created "${newEntry.name}" with ${newEntry.deck.cards.length} starred card${newEntry.deck.cards.length > 1 ? "s" : ""}!\n\nWould you like to study this starred deck now?`,
    );
    if (shouldStudy) {
      saveDeck(newEntry.deck);
      setActiveDeckId(newEntry.id);
      window.location.reload();
    }
  }, [deck]);

  const updateCard = useCallback((id: string, patch: Partial<Card>) => {
    setDeck((d) => {
      if (!d) return d;
      const nd = { ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
      saveDeck(nd);
      return nd;
    });
    setQueue((q) => q.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const handleApplyDeckTranslation = (
    translatedText: string,
    mode: "replace" | "append" | "newDeck",
  ) => {
    if (!deck) return;
    if (mode === "replace") {
      const newDeck = buildDeck(translatedText, deck.maxWords);
      newDeck.name = deck.name ? `${deck.name} (Translated)` : "Translated Deck";
      newDeck.sourceText = translatedText;
      setDeck(newDeck);
      saveDeck(newDeck);
      setQueue(newDeck.cards);
      setIndex(0);
      setHistory([]);
      const activeId = getActiveDeckId();
      saveStudyProgress(activeId, 0, newDeck.cards.length, newDeck.cards[0]?.id);
    } else if (mode === "append") {
      const combined = `${deck.sourceText || deck.cards.map((c) => c.text).join("\n\n")}\n\n---\n\n${translatedText}`;
      const newDeck = buildDeck(combined, deck.maxWords);
      newDeck.name = deck.name;
      newDeck.sourceText = combined;
      setDeck(newDeck);
      saveDeck(newDeck);
      setQueue(newDeck.cards);
      setIndex(0);
      setHistory([]);
    }
  };

  const grabSelection = useCallback(() => {
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (sel && normalizeForCompare(sel)) {
      setPracticeWord(sel);
    }
  }, []);

  // load deck
  useEffect(() => {
    const d = loadDeck();
    if (!d) {
      navigate({ to: "/" });
      return;
    }
    setDeck(d);
    const cardQueue = dueCards(d).length ? dueCards(d) : d.cards;
    setQueue(cardQueue);

    const activeId = getActiveDeckId();
    const prog = getStudyProgress(activeId);
    if (prog && prog.index > 0 && prog.index < cardQueue.length) {
      setResumePrompt({ stoppedIndex: prog.index, total: prog.totalCards || cardQueue.length });
      setIndex(prog.index);
    } else if (
      d.lastStudiedIndex &&
      d.lastStudiedIndex > 0 &&
      d.lastStudiedIndex < cardQueue.length
    ) {
      setIndex(d.lastStudiedIndex);
    }
  }, [navigate]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        replay();
        return;
      }
      if (e.code === "Enter") {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (done) return;

      if (e.key === "1" || e.key.toLowerCase() === "q") {
        e.preventDefault();
        switchAndAdvance("question");
      } else if (e.key === "2" || e.key.toLowerCase() === "u") {
        e.preventDefault();
        switchAndAdvance("quote");
      } else if (e.key === "3" || e.key.toLowerCase() === "f") {
        e.preventDefault();
        switchAndAdvance("fact");
      } else if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        switchAndAdvance();
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleToggleCardTranslate();
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (current) setPracticeWord(cleanNaturalText(current.text));
      } else if (e.key === "ArrowRight") {
        grade(3);
      } else if (e.key === "ArrowLeft") {
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay, undo, grade, switchAndAdvance, handleToggleCardTranslate, done, current]);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  // Preload TTS
  useEffect(() => {
    if (done) return;
    for (let i = 0; i < 3; i++) {
      const c = queue[index + i];
      if (c) prefetchTts(c.text, detectLang(c.text));
    }
  }, [queue, index, done]);

  // Reset counters on card change
  useEffect(() => {
    setPlaysCount(0);
    setRevealed(false);
    setCardViewMode("original");
  }, [current?.id]);

  // Autoplay
  useEffect(() => {
    if (!autoPlay || done || !current) return;
    let cancelled = false;
    (async () => {
      setPlaysCount((c) => c + 1);
      const reason = await speak(current.text);
      if (cancelled || !autoPlay) return;
      if (reason === "ended" && !recallMode) grade(3);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, current?.id, done]);

  const progress = total === 0 ? 0 : (Math.min(index, total) / total) * 100;
  const arabic = current && isArabic(current.text);

  if (!deck) return null;

  if (done) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-4">
        <div className="max-w-md w-full rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
          <div className="text-5xl mb-2">🎉</div>
          <h1 className="text-2xl font-bold">Session Complete!</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">You reviewed all {total} cards.</p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Button
              variant="outline"
              className="h-11 flex-1 gap-1.5 active:scale-95"
              onClick={undo}
              disabled={index === 0 && history.length === 0}
            >
              <Undo2 className="size-4" />
              Undo
            </Button>
            <Button asChild className="h-11 flex-1 active:scale-95">
              <Link to="/" preload="intent">
                Home
              </Link>
            </Button>
            <Button
              variant="secondary"
              className="h-11 flex-1 gap-1.5 active:scale-95"
              onClick={handleStartFromBeginning}
            >
              <RotateCcw className="size-4" />
              Start Over
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[100dvh] flex flex-col justify-between overflow-hidden bg-background select-none">
      {/* Resume Session Modal */}
      {resumePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <BookmarkCheck className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-bold">Resume Study Session?</h2>
                <p className="text-xs text-muted-foreground">
                  Saved at Card {resumePrompt.stoppedIndex + 1} of {resumePrompt.total}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
              <Progress
                value={(resumePrompt.stoppedIndex / resumePrompt.total) * 100}
                className="h-1.5 mb-1.5"
              />
              <div className="flex justify-between font-medium">
                <span>Progress</span>
                <span className="text-foreground">
                  {Math.round((resumePrompt.stoppedIndex / resumePrompt.total) * 100)}%
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <Button
                onClick={handleContinueStopped}
                className="h-11 w-full gap-2 font-semibold active:scale-95"
              >
                <Play className="size-4 fill-current" />
                Continue from Card {resumePrompt.stoppedIndex + 1}
              </Button>
              <Button
                variant="outline"
                onClick={handleStartFromBeginning}
                className="h-10 w-full gap-2 active:scale-95"
              >
                <RotateCcw className="size-4" />
                Start from Beginning
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3x Writing Practice Modal */}
      {practiceWord && (
        <WriteRepeatModal
          isOpen={Boolean(practiceWord)}
          onClose={() => setPracticeWord(null)}
          targetWord={practiceWord}
          fullCardText={cleanNaturalText(current?.text || "")}
          onComplete={() => {
            setPracticeWord(null);
            grade(3);
          }}
        />
      )}

      {/* Quick Question / Note / Quote Modal with Auto-Focus Keyboard & Skip */}
      {current && (
        <QuickQuestionNoteModal
          isOpen={questionNoteModalOpen}
          onClose={() => setQuestionNoteModalOpen(false)}
          card={current}
          initialType={targetModalType}
          onSave={(updated) => {
            updateCard(current.id, {
              cardType: updated.cardType,
              note: updated.note ? cleanNaturalText(updated.note) : undefined,
            });
            setQuestionNoteModalOpen(false);
          }}
        />
      )}

      {/* Full Deck Translation Modal */}
      <FullTextTranslateModal
        isOpen={isDeckTranslateOpen}
        onClose={() => setIsDeckTranslateOpen(false)}
        initialText={deck.sourceText || deck.cards.map((c) => c.text).join("\n\n")}
        deckName={deck.name}
        onApplyTranslation={handleApplyDeckTranslation}
      />

      {/* Top Header Bar — Streamlined, minimal & compact */}
      <header className="shrink-0 px-3.5 py-2.5 border-b border-border/40 bg-card/40 backdrop-blur-md">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-2">
          {/* Back & Deck Info */}
          <div className="flex items-center gap-2 min-w-0">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground shrink-0 active:scale-95"
            >
              <Link to="/" preload="intent">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>

            <div className="min-w-0">
              <h1
                className="text-xs sm:text-sm font-bold text-foreground truncate leading-tight"
                title={deck?.name || "FlashCards"}
              >
                {deck?.name || "FlashCards"}
              </h1>
              <div className="text-[11px] font-mono text-muted-foreground">
                Card {Math.min(index + 1, total)} of {total} · {Math.round(progress)}%
              </div>
            </div>
          </div>

          {/* Quick Header Actions: Speed, Notes, Settings */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Speed preset toggle */}
            <button
              type="button"
              onClick={() => {
                playClick();
                const nextIdx = (SPEED_PRESETS.indexOf(wpm) + 1) % SPEED_PRESETS.length;
                setWpm(SPEED_PRESETS[nextIdx]);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-secondary/80 hover:bg-secondary px-2.5 py-1 text-[11px] font-mono font-semibold text-foreground transition-all active:scale-95"
              title="Click to cycle playback speed"
            >
              <Volume2 className="size-3 text-primary" />
              <span>{wpm} WPM</span>
            </button>

            {/* Notes Button with count badge */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                playClick();
                setShowNotesDrawer(true);
              }}
              className={cn(
                "h-8 px-2.5 gap-1.5 rounded-full text-xs font-semibold transition-all active:scale-95",
                totalNotesCount > 0
                  ? "bg-primary/15 text-primary hover:bg-primary/25"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Open Notes drawer"
            >
              <StickyNote className="size-3.5" />
              <span className="hidden sm:inline">Notes</span>
              {totalNotesCount > 0 && (
                <span className="size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                  {totalNotesCount}
                </span>
              )}
            </Button>

            {/* Quick Settings Drawer Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground active:scale-95"
              onClick={() => {
                playClick();
                setShowSettingsDrawer(true);
              }}
              title="More options & timer"
            >
              <Settings2 className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Continuous Top Progress Bar */}
      <div className="shrink-0 h-1 w-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main Flashcard Viewport Area — Zero scroll on mobile */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 sm:px-4 sm:py-3 max-w-2xl mx-auto w-full overflow-hidden">
        {current && (
          <div className="relative flex-1 flex flex-col justify-between rounded-3xl border border-border/80 bg-card p-5 sm:p-7 shadow-xl shadow-primary/5 transition-all overflow-hidden max-h-[calc(100dvh-170px)] sm:max-h-[calc(100dvh-180px)]">
            {/* Card Header: Type Dot (1-tap cycle) & 1-tap Translate / Star */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/30 shrink-0">
              {/* Minimal Dot: Tapping switches classification instantly and opens quick note modal */}
              <div className="flex items-center gap-2">
                <CardTypeDot
                  card={current}
                  onDotClick={() => {
                    const currType = getCardType(current);
                    const next = NEXT_TYPE_CYCLE[currType] || "question";
                    setTargetModalType(next);
                    setQuestionNoteModalOpen(true);
                  }}
                  onTypeChange={(newType) => {
                    setTargetModalType(newType);
                    setQuestionNoteModalOpen(true);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setTargetModalType(getCardType(current));
                    setQuestionNoteModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all active:scale-95 cursor-pointer"
                  title="Add or edit card note / question"
                >
                  <StickyNote className="size-3 text-primary" />
                  <span>{current.note ? "Edit Note" : "+ Note"}</span>
                </button>
              </div>

              {/* Translation Toggle & Star Action */}
              <div className="flex items-center gap-1.5">
                {/* 1-Click Card Translation */}
                <button
                  type="button"
                  onClick={handleToggleCardTranslate}
                  disabled={isTranslatingCard}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer",
                    cardViewMode === "translated"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                  title={
                    cardViewMode === "translated"
                      ? "Switch back to original"
                      : arabic
                        ? "Translate card to English"
                        : "Translate card to Arabic"
                  }
                >
                  {isTranslatingCard ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Languages className="size-3" />
                  )}
                  <span>{cardViewMode === "translated" ? "Original" : "Translate"}</span>
                </button>

                {/* 3x Writing Practice */}
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setPracticeWord(cleanNaturalText(current.text));
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all active:scale-95 cursor-pointer"
                  title="Practice writing this card 3 times (or press W)"
                >
                  <Pencil className="size-3 text-primary" />
                  <span>3× Write</span>
                </button>

                {/* Star Button */}
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    updateCard(current.id, { starred: !current.starred });
                  }}
                  className={cn(
                    "p-1.5 rounded-full transition-all active:scale-90 cursor-pointer",
                    current.starred
                      ? "text-amber-400 bg-amber-400/10 hover:bg-amber-400/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                  title={current.starred ? "Starred card" : "Star card"}
                >
                  <Star className={cn("size-4", current.starred && "fill-current")} />
                </button>
              </div>
            </div>

            {/* Card Body Text & Recall State */}
            <div className="flex-1 flex flex-col justify-center my-3 overflow-y-auto min-h-0 select-text">
              {recallMode && !revealed && playsCount >= 2 ? (
                <div className="flex flex-col items-center justify-center text-center p-4 space-y-3">
                  <div className="text-xs text-muted-foreground font-medium">
                    Recall Mode Active
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setRevealed(true);
                    }}
                    className="w-full max-w-xs py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold shadow-md hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Eye className="size-4" />
                    <span>Press to Reveal Card</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col justify-center">
                  {cardViewMode === "translated" && activeTranslation ? (
                    <div
                      dir={activeCardTargetLang === "ar" ? "rtl" : "ltr"}
                      className={cn(
                        "cursor-text select-text text-xl sm:text-2xl font-medium leading-relaxed text-foreground animate-in fade-in duration-100",
                        activeCardTargetLang === "ar" && "font-serif text-2xl sm:text-3xl",
                      )}
                      onMouseUp={grabSelection}
                      onTouchEnd={() => setTimeout(grabSelection, 200)}
                    >
                      {cleanNaturalText(activeTranslation.text)}
                    </div>
                  ) : (
                    <div
                      dir={arabic ? "rtl" : "ltr"}
                      className={cn(
                        "cursor-text select-text text-xl sm:text-2xl font-medium leading-relaxed text-foreground animate-in fade-in duration-100",
                        arabic && "font-serif text-2xl sm:text-3xl",
                      )}
                      onMouseUp={grabSelection}
                      onTouchEnd={() => setTimeout(grabSelection, 200)}
                    >
                      {cleanNaturalText(current.text)}
                    </div>
                  )}

                  {/* Clean Note Preview Tag if present */}
                  {current.note && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetModalType(getCardType(current));
                        setQuestionNoteModalOpen(true);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-xl bg-muted/60 hover:bg-muted border border-border/40 text-xs text-muted-foreground hover:text-foreground text-left transition-all active:scale-95 cursor-pointer max-w-full"
                      title="Tap to edit note"
                    >
                      <StickyNote className="size-3 text-primary shrink-0" />
                      <span className="truncate">{cleanNaturalText(current.note)}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Card Footer Status */}
            <div className="flex items-center justify-between pt-2 border-t border-border/20 text-[11px] text-muted-foreground shrink-0">
              <span className="truncate">
                Highlight any text to <span className="text-primary font-medium">Write 3×</span> or{" "}
                <span className="text-emerald-400 font-medium">Add to Notes</span>
              </span>
              <span className="shrink-0 ml-2 font-mono">
                {current.reps || 0} reps · {current.due ? formatDue(current.due) : "New"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Mobile Bottom Thumb Dock — Everything within instant reach */}
      <footer className="shrink-0 border-t border-border/50 bg-card/90 backdrop-blur-md px-3.5 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-2.5">
          {/* Previous Card */}
          <Button
            variant="secondary"
            size="lg"
            className="h-12 w-14 sm:w-28 shrink-0 rounded-2xl font-semibold gap-1.5 active:scale-90 transition-all cursor-pointer"
            onClick={undo}
            disabled={index === 0 && history.length === 0}
            title="Previous card (← / Ctrl+Z)"
          >
            <ArrowLeft className="size-5" />
            <span className="hidden sm:inline">Prev</span>
          </Button>

          {/* Large Center Play / Pause Button */}
          <Button
            onClick={togglePlay}
            size="lg"
            className={cn(
              "flex-1 h-12 rounded-2xl gap-2 font-bold text-base shadow-lg transition-all active:scale-95 cursor-pointer",
              isPlaying
                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20"
                : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20",
            )}
            title="Play / Pause Audio (Space)"
          >
            {isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="size-5 fill-current" />
            ) : (
              <Play className="size-5 fill-current" />
            )}
            <span>
              {isLoading ? "Loading..." : isPlaying ? "Pause" : playsCount > 0 ? "Replay" : "Play"}
            </span>
          </Button>

          {/* Next Card / Advance */}
          <Button
            size="lg"
            className="h-12 w-14 sm:w-28 shrink-0 rounded-2xl font-semibold gap-1.5 active:scale-90 transition-all cursor-pointer"
            onClick={() => grade(3)}
            title="Next card (→)"
          >
            <span className="hidden sm:inline">Next</span>
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </footer>

      {/* Sleek Slide-over Notes & Starred Drawer */}
      {showNotesDrawer && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-primary" />
              <h2 className="font-bold text-sm">Notes & Starred</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs active:scale-95"
                title="Add a new quick note"
                onClick={() => {
                  playClick();
                  saveFreeNotes([{ id: `n-${Date.now()}`, text: "" }, ...freeNotes]);
                }}
              >
                <Plus className="size-3.5" /> Note
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs active:scale-95"
                title="Copy all notes to clipboard"
                onClick={() => {
                  playClick();
                  const parts = [
                    ...freeNotes.filter((n) => n.text.trim()).map((n) => noteToText("", n.text)),
                    ...deck.cards
                      .filter((c) => c.starred || (c.note && c.note.trim()))
                      .map((c) => noteToText(c.text, c.note)),
                  ];
                  navigator.clipboard.writeText(parts.join("\n\n---\n\n")).catch(() => {});
                }}
              >
                <Copy className="size-3.5" /> All
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 rounded-full"
                onClick={() => setShowNotesDrawer(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Starred Cards to Deck Banner */}
            {starredCardsCount > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Star className="size-3.5 fill-amber-400" />
                      {starredCardsCount} Starred Card{starredCardsCount > 1 ? "s" : ""}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Export into a separate dedicated study deck.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleMakeStarredDeck}
                    className="h-8 shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl active:scale-95"
                  >
                    Make Deck
                  </Button>
                </div>
              </div>
            )}

            {/* Free Notes List */}
            {freeNotes.map((n) => (
              <div key={n.id} className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-primary tracking-wider">
                    Quick Note
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(noteToText("", n.text)).catch(() => {})
                      }
                      className="text-muted-foreground hover:text-foreground"
                      title="Copy note"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      onClick={() => saveFreeNotes(freeNotes.filter((x) => x.id !== n.id))}
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete note"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
                <Textarea
                  value={n.text}
                  onChange={(e) =>
                    saveFreeNotes(
                      freeNotes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)),
                    )
                  }
                  placeholder="Write your note..."
                  className="min-h-16 text-xs bg-background/60 rounded-xl"
                  dir="auto"
                />
              </div>
            ))}

            {/* Current card personal note */}
            {current && (
              <div className="rounded-2xl border border-border bg-secondary/30 p-3.5">
                <div className="mb-1 text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Note for Card #{index + 1}</span>
                  {current.starred && (
                    <span className="text-amber-400 text-[11px] flex items-center gap-1 font-bold">
                      <Star className="size-3 fill-current" /> Starred
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mb-2 line-clamp-2" dir="auto">
                  {current.text}
                </div>
                <Textarea
                  value={current.note ?? ""}
                  onChange={(e) => updateCard(current.id, { note: e.target.value })}
                  placeholder="Add note for this card..."
                  className="min-h-16 text-xs bg-background/80 rounded-xl"
                  dir="auto"
                />
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Settings & Options Drawer */}
      {showSettingsDrawer && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Settings2 className="size-4 text-primary" /> Study Options
            </h2>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-full"
              onClick={() => setShowSettingsDrawer(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Speed Slider */}
            <div className="rounded-2xl border border-border p-3.5 space-y-2">
              <div className="flex items-center justify-between font-semibold text-foreground">
                <span>Speed</span>
                <span className="font-mono text-primary font-bold">{wpm} WPM</span>
              </div>
              <Slider
                value={[wpm]}
                min={100}
                max={900}
                step={10}
                onValueChange={(v) => setWpm(v[0])}
              />
            </div>

            {/* Toggles */}
            <div className="rounded-2xl border border-border p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">Autoplay</div>
                  <div className="text-muted-foreground text-[11px]">
                    Auto-read and advance cards
                  </div>
                </div>
                <Switch checked={autoPlay} onCheckedChange={setAutoPlay} />
              </div>

              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <div>
                  <div className="font-semibold text-foreground">Recall Mode</div>
                  <div className="text-muted-foreground text-[11px]">
                    Hold button to reveal card
                  </div>
                </div>
                <Switch checked={recallMode} onCheckedChange={setRecallMode} />
              </div>
            </div>

            {/* Pomodoro Timer */}
            <div className="rounded-2xl border border-border p-3.5">
              <PomodoroWidget />
            </div>

            {/* Full Deck Translation */}
            <Button
              variant="outline"
              className="w-full h-10 gap-2 text-xs font-semibold rounded-xl active:scale-95"
              onClick={() => {
                setShowSettingsDrawer(false);
                setIsDeckTranslateOpen(true);
              }}
            >
              <Languages className="size-4 text-primary" />
              <span>Translate Full Deck</span>
            </Button>

            {/* Restart Session */}
            <Button
              variant="secondary"
              className="w-full h-10 gap-2 text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground active:scale-95"
              onClick={() => {
                if (window.confirm("Restart study session from Card 1?")) {
                  setShowSettingsDrawer(false);
                  handleStartFromBeginning();
                }
              }}
            >
              <RotateCcw className="size-4" />
              <span>Restart from Beginning</span>
            </Button>
          </div>
        </aside>
      )}
    </main>
  );
}
