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
  Loader2,
  ArrowLeftRight,
  PenTool,
  StickyNote,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { loadDeck } from "@/lib/flashcards";
import { WriteRepeatModal } from "@/components/WriteRepeatModal";
import { playCorrect } from "@/lib/sounds";
import { cn } from "@/lib/utils";

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

  // Token Context State for word range extension
  const [tokens, setTokens] = useState<string[]>([]);
  const [startIdx, setStartIdx] = useState<number>(0);
  const [endIdx, setEndIdx] = useState<number>(0);

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
    try {
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
    } catch {
      // ignore
    }
    setSelectedText("");
    setTokens([]);
    setStartIdx(0);
    setEndIdx(0);
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

  // Word Selection & Extension Handlers
  const handleExtendLeft = () => {
    if (startIdx > 0 && tokens.length) {
      const nextStart = startIdx - 1;
      setStartIdx(nextStart);
      const newText = tokens.slice(nextStart, endIdx + 1).join(" ");
      setSelectedText(newText);
      runTranslation(newText, forcedTarget || undefined);
    }
  };

  const handleExtendRight = () => {
    if (endIdx < tokens.length - 1 && tokens.length) {
      const nextEnd = endIdx + 1;
      setEndIdx(nextEnd);
      const newText = tokens.slice(startIdx, nextEnd + 1).join(" ");
      setSelectedText(newText);
      runTranslation(newText, forcedTarget || undefined);
    }
  };

  const handleSelectWordOnly = () => {
    if (tokens.length) {
      setEndIdx(startIdx);
      const newText = tokens[startIdx] || selectedText;
      setSelectedText(newText);
      runTranslation(newText, forcedTarget || undefined);
    }
  };

  const handleSelectFullSentence = () => {
    if (tokens.length) {
      setStartIdx(0);
      setEndIdx(tokens.length - 1);
      const newText = tokens.join(" ");
      setSelectedText(newText);
      runTranslation(newText, forcedTarget || undefined);
    }
  };

  const handleTokenClick = (idx: number) => {
    if (!tokens.length) return;
    let nextStart = startIdx;
    let nextEnd = endIdx;

    if (idx < startIdx) {
      nextStart = idx;
    } else if (idx > endIdx) {
      nextEnd = idx;
    } else {
      nextStart = idx;
      nextEnd = idx;
    }

    setStartIdx(nextStart);
    setEndIdx(nextEnd);
    const newText = tokens.slice(nextStart, nextEnd + 1).join(" ");
    setSelectedText(newText);
    runTranslation(newText, forcedTarget || undefined);
  };

  // Text Selection & Tap Listener
  useEffect(() => {
    let timeoutId: number;

    const processSelectionOrPoint = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const rawText = selection.toString().trim();
        if (!rawText || rawText.length < 1) return;

        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);

        // Ignore if selection is inside tooltip or modal or input/textarea
        if (
          tooltipRef.current &&
          (tooltipRef.current.contains(range.startContainer) ||
            tooltipRef.current.contains(range.endContainer))
        ) {
          return;
        }

        const targetEl = range.startContainer.parentElement;
        if (
          targetEl &&
          (targetEl.tagName === "INPUT" ||
            targetEl.tagName === "TEXTAREA" ||
            targetEl.isContentEditable)
        ) {
          return;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        // Extract paragraph/sentence token context
        let contextText = rawText;
        if (range.commonAncestorContainer) {
          const parentText = range.commonAncestorContainer.textContent || "";
          if (parentText.trim()) {
            contextText = parentText.trim();
          }
        }

        // Clean & split into tokens
        const allTokens = contextText
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean);

        const activeTokens = allTokens.length > 0 ? allTokens : [rawText];

        // Locate rawText in activeTokens
        let foundStart = 0;
        let foundEnd = 0;

        const rawWords = rawText.split(/\s+/).filter(Boolean);
        const firstWord = rawWords[0] || rawText;

        const matchIdx = activeTokens.findIndex((t) =>
          t.toLowerCase().includes(firstWord.toLowerCase()),
        );

        if (matchIdx !== -1) {
          foundStart = matchIdx;
          foundEnd = Math.min(activeTokens.length - 1, matchIdx + rawWords.length - 1);
        }

        const tooltipWidth = Math.min(310, window.innerWidth - 16);
        const screenPadding = 8;
        const centeredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
        const clampedLeft = Math.max(
          screenPadding,
          Math.min(window.innerWidth - tooltipWidth - screenPadding, centeredLeft),
        );

        const placeBelow = rect.top < 120;
        const top = placeBelow ? rect.bottom + 8 : rect.top - 8;

        const cleanSelectedText = activeTokens.slice(foundStart, foundEnd + 1).join(" ");

        setTokens(activeTokens);
        setStartIdx(foundStart);
        setEndIdx(foundEnd);
        setSelectedText(cleanSelectedText || rawText);
        setPosition({ top, left: clampedLeft, placeBelow });
        setForcedTarget(null);

        // Run translation
        runTranslation(cleanSelectedText || rawText);
      }, 120);
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && tooltipRef.current.contains(e.target as Node)) {
        return;
      }
      clearSelectionState();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelectionState();
        setFullDocOpen(false);
      }
    };

    document.addEventListener("selectionchange", processSelectionOrPoint);
    document.addEventListener("mouseup", processSelectionOrPoint);
    document.addEventListener("touchend", processSelectionOrPoint);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("selectionchange", processSelectionOrPoint);
      document.removeEventListener("mouseup", processSelectionOrPoint);
      document.removeEventListener("touchend", processSelectionOrPoint);
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

  // Copy text
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <>
      {/* Compact Floating Window */}
      {position && selectedText && (
        <div
          ref={tooltipRef}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: position.placeBelow ? "none" : "translateY(-100%)",
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="fixed z-50 w-[310px] max-w-[92vw] rounded-xl border border-border/80 bg-popover/95 p-2 text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none"
          role="tooltip"
        >
          {/* Header Bar: Selection info & Range Extension */}
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-border/40 text-xs">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={handleSwapLanguage}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors cursor-pointer shrink-0"
                title="Swap translation direction"
              >
                <span>{detectedLang.toUpperCase()}</span>
                <ArrowLeftRight className="size-2.5 text-muted-foreground" />
                <span>{targetLang.toUpperCase()}</span>
              </button>

              <span
                className="truncate text-[11px] font-semibold text-primary max-w-[100px]"
                title={selectedText}
              >
                {selectedText}
              </span>
              {tokens.length > 1 && (
                <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                  ({endIdx - startIdx + 1}w)
                </span>
              )}
            </div>

            {/* Range controls: Extend left / right, 1w, All */}
            <div className="flex items-center gap-0.5 shrink-0">
              {tokens.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handleExtendLeft}
                    disabled={startIdx <= 0}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 cursor-pointer"
                    title="Extend left (←)"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectWordOnly}
                    className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Select single word"
                  >
                    1w
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectFullSentence}
                    className="rounded px-1 py-0.5 text-[9px] font-bold bg-muted hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Select full sentence"
                  >
                    All
                  </button>

                  <button
                    type="button"
                    onClick={handleExtendRight}
                    disabled={endIdx >= tokens.length - 1}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 cursor-pointer"
                    title="Extend right (→)"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={clearSelectionState}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors cursor-pointer ml-1"
                aria-label="Close window"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Word Chips (if sentence tokens exist) */}
          {tokens.length > 1 && (
            <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto py-1 border-b border-border/30 text-[10px]">
              {tokens.map((tok, idx) => {
                const isSel = idx >= startIdx && idx <= endIdx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleTokenClick(idx)}
                    className={cn(
                      "px-1 py-0.5 rounded text-[10px] transition-all cursor-pointer truncate max-w-[90px]",
                      isSel
                        ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                        : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {tok}
                  </button>
                );
              })}
            </div>
          )}

          {/* Translation Result Area */}
          <div className="py-1.5 space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-2 gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span>Translating...</span>
              </div>
            ) : translation ? (
              <>
                <div className="flex items-start justify-between gap-1.5">
                  <p
                    className="text-xs sm:text-sm font-medium leading-snug text-foreground break-words max-w-[210px]"
                    dir={translation.targetLang === "ar" ? "rtl" : "ltr"}
                  >
                    {translation.text}
                  </p>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleRepeatAudio(translation.text, translation.targetLang, 3)}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                      title="Repeat 3×"
                    >
                      <Volume2 className="size-3" />
                      <span>3×</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlayAudio(translation.text, translation.targetLang)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                      title="Speak 1×"
                    >
                      <Volume2 className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(translation.text)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                      title="Copy"
                    >
                      {copied ? (
                        <Check className="size-3 text-emerald-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Alternatives */}
                {translation.alternatives && translation.alternatives.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {translation.alternatives.slice(0, 3).map((alt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setTranslation({ ...translation, text: alt });
                          handleCopy(alt);
                        }}
                        className="rounded bg-secondary/80 hover:bg-secondary px-1.5 py-0.5 text-[9px] text-secondary-foreground hover:text-primary transition-colors cursor-pointer"
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Quick Action Footer */}
          <div className="flex items-center justify-between border-t border-border/40 pt-1 text-[10px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleAddToNotes}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all cursor-pointer"
                title="Save to Notes"
              >
                {savedNote ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <StickyNote className="size-3" />
                )}
                <span>{savedNote ? "Saved" : "+ Note"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsWriteModalOpen(true)}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 transition-all cursor-pointer"
                title="Practice writing 3×"
              >
                <PenTool className="size-3" />
                <span>Write 3×</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearSelectionState();
                }}
                className="flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-medium bg-muted hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-all cursor-pointer"
                title="Dismiss pop up"
              >
                <X className="size-3" />
                <span>Cancel</span>
              </button>
            </div>
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
    </>
  );
}
