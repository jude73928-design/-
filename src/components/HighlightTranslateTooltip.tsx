import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  detectLanguage,
  translatePhrase,
  batchTranslate,
  TranslationResult,
} from "@/services/translator";
import { speak, speakRepeat, type TtsHandle } from "@/lib/tts";
import {
  Languages,
  Volume2,
  Copy,
  Check,
  X,
  FileText,
  Loader2,
  ArrowLeftRight,
  PenTool,
  StickyNote,
} from "lucide-react";
import { loadDeck } from "@/lib/flashcards";
import { WriteRepeatModal } from "@/components/WriteRepeatModal";
import { playCorrect } from "@/lib/sounds";

export function HighlightTranslateTooltip() {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placeBelow: boolean;
  } | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [forcedTarget, setForcedTarget] = useState<"ar" | "en" | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [repeatIteration, setRepeatIteration] = useState<number | null>(null);
  const [repeatTotal, setRepeatTotal] = useState<number>(3);
  const [autoRepeatOnMobile, setAutoRepeatOnMobile] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fc_auto_repeat_3x");
      if (saved !== null) return saved === "true";
      return window.innerWidth < 768 || "ontouchstart" in window;
    }
    return true;
  });

  // Writing practice modal state
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);

  // Full doc translation modal state
  const [fullDocOpen, setFullDocOpen] = useState(false);
  const [fullDocTranslating, setFullDocTranslating] = useState(false);
  const [fullDocProgress, setFullDocProgress] = useState({ completed: 0, total: 0 });
  const [fullDocResult, setFullDocResult] = useState<string>("");
  const [fullDocCopied, setFullDocCopied] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const audioHandleRef = useRef<TtsHandle | null>(null);

  const detectedLang = selectedText ? detectLanguage(selectedText) : "en";
  const targetLang = forcedTarget || (detectedLang === "ar" ? "en" : "ar");

  const clearSelectionState = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    audioHandleRef.current?.stop();
    audioHandleRef.current = null;
    setSelectedText("");
    setPosition(null);
    setTranslation(null);
    setIsLoading(false);
    setForcedTarget(null);
    setCopied(false);
    setSavedNote(false);
    setIsPlayingAudio(false);
    setRepeatIteration(null);
  }, []);

  const runTranslation = useCallback(async (text: string, forceTarget?: "ar" | "en") => {
    if (!text.trim()) return;
    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setIsLoading(true);
    setTranslation(null);

    try {
      const result = await translatePhrase(text, {
        forceTargetLang: forceTarget,
        signal: ac.signal,
      });
      if (!ac.signal.aborted) {
        setTranslation(result);
        setIsLoading(false);
      }
    } catch {
      if (!ac.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  // Repeat Audio Playback
  const handlePlayRepeatAudio = useCallback(
    async (textToSpeak: string, lang: "ar" | "en", times = 3) => {
      if (!textToSpeak.trim()) return;
      audioHandleRef.current?.stop();
      setIsPlayingAudio(true);
      setRepeatTotal(times);
      setRepeatIteration(1);
      try {
        const handle = await speakRepeat(
          textToSpeak,
          lang,
          180,
          times,
          450,
          (curr, total) => {
            setRepeatIteration(curr);
            setRepeatTotal(total);
          },
          () => {
            setIsPlayingAudio(false);
            setRepeatIteration(null);
          },
        );
        audioHandleRef.current = handle;
        await handle.ended;
      } catch (e) {
        console.warn("Audio repeat playback failed", e);
      } finally {
        setIsPlayingAudio(false);
        setRepeatIteration(null);
      }
    },
    [],
  );

  const toggleRepeatAudio = useCallback(
    (textToSpeak: string, lang: "ar" | "en", times = 3) => {
      if (isPlayingAudio) {
        audioHandleRef.current?.stop();
        setIsPlayingAudio(false);
        setRepeatIteration(null);
      } else {
        void handlePlayRepeatAudio(textToSpeak, lang, times);
      }
    },
    [isPlayingAudio, handlePlayRepeatAudio],
  );

  // Single Audio Playback
  const handlePlayAudio = useCallback(async (textToSpeak: string, lang: "ar" | "en") => {
    audioHandleRef.current?.stop();
    setIsPlayingAudio(true);
    setRepeatIteration(null);
    try {
      const handle = await speak(textToSpeak, lang, 180, () => {});
      audioHandleRef.current = handle;
      await handle.ended;
    } catch (e) {
      console.error("Audio playback error", e);
    } finally {
      setIsPlayingAudio(false);
    }
  }, []);

  // Add highlighted text directly into notes
  const handleAddToNotes = () => {
    if (!selectedText.trim()) return;
    try {
      const raw = localStorage.getItem("flashcards-freenotes-v1");
      const currentNotes = raw ? JSON.parse(raw) : [];
      const noteContent = translation ? `${selectedText}\n${translation.text}` : selectedText;
      const updatedNotes = [{ id: `n-${Date.now()}`, text: noteContent }, ...currentNotes];
      localStorage.setItem("flashcards-freenotes-v1", JSON.stringify(updatedNotes));
      window.dispatchEvent(new CustomEvent("flashcards-notes-changed"));
      playCorrect();
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2000);
    } catch (e) {
      console.warn("Failed to add note", e);
    }
  };

  // Text selection listener
  useEffect(() => {
    let timeoutId: number;

    const handleSelectionChange = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          return;
        }

        const text = selection.toString().trim();
        // Ignore single character or empty
        if (!text || text.length < 2) {
          return;
        }

        // Avoid triggering if selection is inside our tooltip or modals
        if (
          tooltipRef.current &&
          (tooltipRef.current.contains(selection.anchorNode) ||
            tooltipRef.current.contains(selection.focusNode))
        ) {
          return;
        }

        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (!range) return;

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        // Position tooltip centered horizontally above selection
        const tooltipWidth = Math.min(330, window.innerWidth - 20);
        const screenPadding = 10;
        const centeredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
        const clampedLeft = Math.max(
          screenPadding,
          Math.min(window.innerWidth - tooltipWidth - screenPadding, centeredLeft),
        );

        // If selection is near top of window, place below
        const placeBelow = rect.top < 140;
        const top = placeBelow ? rect.bottom + 10 : rect.top - 10;

        setSelectedText(text);
        setPosition({ top, left: clampedLeft, placeBelow });
        setForcedTarget(null);

        // Auto-run translation immediately
        runTranslation(text);

        // On mobile: auto-repeat 3 times when highlighted if auto-repeat is enabled
        const isMobile = window.innerWidth < 768 || "ontouchstart" in window;
        if (isMobile && autoRepeatOnMobile) {
          const lang = detectLanguage(text);
          void handlePlayRepeatAudio(text, lang, 3);
        }
      }, 150);
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && tooltipRef.current.contains(e.target as Node)) {
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        clearSelectionState();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelectionState();
        setFullDocOpen(false);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      abortControllerRef.current?.abort();
      audioHandleRef.current?.stop();
    };
  }, [clearSelectionState, runTranslation, autoRepeatOnMobile, handlePlayRepeatAudio]);

  // Swap language direction
  const handleSwapLanguage = () => {
    const nextTarget = targetLang === "ar" ? "en" : "ar";
    setForcedTarget(nextTarget);
    runTranslation(selectedText, nextTarget);
  };

  // Copy translated or alternative text
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Full Doc translation handler
  const handleFullDocTranslate = async () => {
    setFullDocOpen(true);
    setFullDocTranslating(true);
    setFullDocProgress({ completed: 0, total: 0 });
    setFullDocResult("");

    let docText = "";
    const deck = loadDeck();
    if (deck && deck.sourceText) {
      docText = deck.sourceText;
    } else {
      const articleEl = document.querySelector("main") || document.body;
      docText = articleEl.innerText.trim();
    }

    if (!docText) {
      docText = selectedText;
    }

    const docLang = detectLanguage(docText);
    const target = docLang === "ar" ? "en" : "ar";

    try {
      const res = await batchTranslate(docText, {
        sourceLang: docLang,
        targetLang: target,
        concurrency: 6,
        onProgress: (completed, total) => {
          setFullDocProgress({ completed, total });
        },
      });
      setFullDocResult(res.translatedText);
    } catch (e) {
      console.error("Full doc translation error", e);
    } finally {
      setFullDocTranslating(false);
    }
  };

  return (
    <>
      {/* Floating Tooltip */}
      {position && selectedText && (
        <div
          ref={tooltipRef}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: position.placeBelow ? "none" : "translateY(-100%)",
          }}
          className="fixed z-50 w-80 max-w-[92vw] rounded-2xl border border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          role="tooltip"
        >
          {/* Header Action Bar */}
          <div className="mb-2 flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSwapLanguage}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors cursor-pointer"
                title="Swap translation direction"
              >
                <span>{detectedLang.toUpperCase()}</span>
                <ArrowLeftRight className="size-3 text-muted-foreground" />
                <span>{targetLang.toUpperCase()}</span>
              </button>

              <button
                type="button"
                onClick={() => runTranslation(selectedText, forcedTarget || undefined)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                title={detectedLang === "en" ? "Translate · ترجم" : "Translate → EN"}
              >
                <Languages className="size-3.5" />
                <span>{detectedLang === "en" ? "Translate" : "Translate"}</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              {/* Add to Notes Button */}
              <button
                type="button"
                onClick={handleAddToNotes}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all cursor-pointer"
                title="Save highlighted text directly to Notes"
              >
                {savedNote ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <StickyNote className="size-3" />
                )}
                <span>{savedNote ? "Saved!" : "+ Note"}</span>
              </button>

              {/* Write 3x Modal Trigger */}
              <button
                type="button"
                onClick={() => setIsWriteModalOpen(true)}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 transition-all cursor-pointer"
                title="Open 3× Writing Practice modal"
              >
                <PenTool className="size-3" />
                <span>Write 3×</span>
              </button>

              <button
                type="button"
                onClick={clearSelectionState}
                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Translation Body */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Translating · جارٍ الترجمة...</span>
              </div>
            ) : translation ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p
                    className="text-sm font-semibold leading-snug text-foreground break-words"
                    dir={translation.targetLang === "ar" ? "rtl" : "ltr"}
                  >
                    {translation.text}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleRepeatAudio(translation.text, translation.targetLang, 3)}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-primary transition-colors cursor-pointer"
                      title="Repeat translation 3×"
                    >
                      <Volume2 className="size-3" />
                      <span className="text-[10px] font-bold">3×</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlayAudio(translation.text, translation.targetLang)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                      title="Speak translation 1×"
                    >
                      <Volume2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(translation.text)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                      title="Copy translation"
                    >
                      {copied ? (
                        <Check className="size-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Clickable Dictionary Alternatives */}
                {translation.alternatives && translation.alternatives.length > 0 && (
                  <div className="pt-1.5 border-t border-border/40">
                    <span className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Alternatives · البدائل
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {translation.alternatives.slice(0, 5).map((alt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setTranslation({ ...translation, text: alt });
                            handleCopy(alt);
                          }}
                          className="rounded-full bg-secondary/80 hover:bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground hover:text-primary transition-colors cursor-pointer"
                          title="Click to select & copy synonym"
                        >
                          {alt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Repeat Controls & Auto-play toggle */}
                <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span
                      className={`size-1.5 rounded-full ${
                        isPlayingAudio && repeatIteration !== null
                          ? "bg-amber-500 animate-ping"
                          : "bg-emerald-500"
                      }`}
                    />
                    <span>
                      {isPlayingAudio && repeatIteration !== null
                        ? `Repeating ${repeatIteration} of ${repeatTotal}…`
                        : "3× Audio Repeat"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !autoRepeatOnMobile;
                      setAutoRepeatOnMobile(next);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("fc_auto_repeat_3x", String(next));
                      }
                    }}
                    className="hover:underline text-foreground/80 font-medium cursor-pointer"
                    title="Toggle automatic 3x playback when selecting text"
                  >
                    Auto-play: {autoRepeatOnMobile ? "ON" : "OFF"}
                  </button>
                </div>
              </>
            ) : (
              <div className="py-2 text-center text-xs text-muted-foreground">
                Highlight text to translate, save to notes, or practice 3×
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3x Writing Practice Modal */}
      {isWriteModalOpen && selectedText && (
        <WriteRepeatModal
          isOpen={isWriteModalOpen}
          onClose={() => setIsWriteModalOpen(false)}
          targetWord={selectedText}
          targetLang={detectedLang}
          onComplete={() => {
            setIsWriteModalOpen(false);
            clearSelectionState();
          }}
        />
      )}

      {/* Full Document Translation Dialog */}
      {fullDocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl text-card-foreground">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-bold">Full Document Translation</h2>
                <p className="text-xs text-muted-foreground">
                  High-speed parallel chunk translation (English ↔ Arabic)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFullDocOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {fullDocTranslating && (
              <div className="my-6 space-y-2 text-center">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="font-medium text-sm">
                    Translating chunks {fullDocProgress.completed} of {fullDocProgress.total}...
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{
                      width: fullDocProgress.total
                        ? `${(fullDocProgress.completed / fullDocProgress.total) * 100}%`
                        : "20%",
                    }}
                  />
                </div>
              </div>
            )}

            {fullDocResult && (
              <div className="space-y-4">
                <div
                  className="max-h-96 overflow-y-auto rounded-xl border border-border/60 bg-muted/40 p-4 text-sm whitespace-pre-wrap leading-relaxed"
                  dir={detectLanguage(fullDocResult) === "ar" ? "rtl" : "ltr"}
                >
                  {fullDocResult}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(fullDocResult);
                      setFullDocCopied(true);
                      setTimeout(() => setFullDocCopied(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    {fullDocCopied ? (
                      <>
                        <Check className="size-4 text-emerald-300" />
                        <span>Copied Translation!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" />
                        <span>Copy Full Translation</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullDocOpen(false)}
                    className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
