import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Languages,
  X,
  Volume2,
  Copy,
  Check,
  Loader2,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  PenTool,
  Sparkles,
} from "lucide-react";
import { translatePhrase, type TranslationResult } from "@/services/translator";
import { cleanNaturalText, CardType, NEXT_TYPE_CYCLE } from "@/lib/flashcards";
import { detectLang as detectLanguage, stopAllAudio, speak, type TtsHandle } from "@/lib/tts";
import { cn } from "@/lib/utils";
import { WriteRepeatModal } from "./WriteRepeatModal";
import { playMutedTick, playCorrect } from "@/lib/sounds";
import { CardTypeDot } from "@/components/CardTypeDot";

export function HighlightTranslateTooltip() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [forcedTarget, setForcedTarget] = useState<"ar" | "en" | null>(null);
  const [cardType, setCardType] = useState<CardType>("fact");

  // Audio Playback State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Token Context State for word range extension
  const [tokens, setTokens] = useState<string[]>([]);
  const [startIdx, setStartIdx] = useState<number>(0);
  const [endIdx, setEndIdx] = useState<number>(0);

  // Writing practice modal state
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);

  // Refs for tracking
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioHandleRef = useRef<TtsHandle | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const detectedLang = selectedText ? detectLanguage(selectedText) : "en";
  const defaultTarget = detectedLang === "ar" ? "en" : "ar";
  const targetLang = forcedTarget || defaultTarget;
  const isArabicDetected = detectedLang === "ar";

  // Immediate Clean Selection Reset
  const clearSelectionState = useCallback(() => {
    abortControllerRef.current?.abort();
    audioHandleRef.current?.stop();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setIsOpen(false);
    setSelectedText("");
    setTranslation(null);
    setIsLoading(false);
    setCopied(false);
    setSavedNote(false);
    setForcedTarget(null);
    setIsPlayingAudio(false);
    setTokens([]);
    setStartIdx(0);
    setEndIdx(0);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fc-selection-range", { detail: null }));
      const win = window as unknown as {
        __fc_translation_active?: boolean;
        __fc_dismissed_until?: number;
      };
      win.__fc_translation_active = false;
      win.__fc_dismissed_until = 0;
    }
  }, []);

  // Sync active range selection with InteractiveCardText
  useEffect(() => {
    if (isOpen && tokens.length > 0 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fc-selection-range", {
          detail: { startIdx, endIdx },
        }),
      );
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fc-selection-range", {
          detail: null,
        }),
      );
    }
  }, [isOpen, tokens.length, startIdx, endIdx]);

  // Keyboard escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        clearSelectionState();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, clearSelectionState]);

  // Run translation query
  const runTranslation = useCallback(async (textToTranslate: string, forceTarget?: "ar" | "en") => {
    if (!textToTranslate.trim()) return;

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setIsLoading(true);
    setTranslation(null);

    const detected = detectLanguage(textToTranslate);
    const effectiveTarget = forceTarget || (detected === "ar" ? "en" : "ar");

    try {
      const res = await translatePhrase(textToTranslate, {
        targetLang: effectiveTarget,
        signal: ac.signal,
      });
      if (!ac.signal.aborted) {
        setTranslation(res);
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        console.error("Translation error:", err);
      }
    } finally {
      if (!ac.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleStopAudio = useCallback(() => {
    stopAllAudio();
    audioHandleRef.current?.stop();
    setIsPlayingAudio(false);
  }, []);

  // Single Audio Playback
  const handlePlaySingleAudio = useCallback(async (textToSpeak: string, lang: "ar" | "en") => {
    audioHandleRef.current?.stop();
    setIsPlayingAudio(true);
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

  // Auto Fact Check Note Addition & Card Classification Update
  const handleAutoFactCheck = () => {
    if (!selectedText.trim()) return;
    playCorrect();

    const translationStr = translation?.text ? ` (${translation.text})` : "";
    const factCheckNote = `${selectedText}${translationStr}`;

    // 1. Dispatch event to update active card automatically
    window.dispatchEvent(
      new CustomEvent("fc-add-note-to-active-card", {
        detail: {
          noteText: factCheckNote,
          cardType: cardType,
        },
      }),
    );

    // 2. Also save to free notes in localStorage
    try {
      const raw = localStorage.getItem("flashcards-freenotes-v1");
      const currentNotes = raw ? JSON.parse(raw) : [];
      const updatedNotes = [
        { id: `n-${Date.now()}`, text: `[Fact Check] ${factCheckNote}` },
        ...currentNotes,
      ];
      localStorage.setItem("flashcards-freenotes-v1", JSON.stringify(updatedNotes));
      window.dispatchEvent(new CustomEvent("flashcards-notes-changed"));
    } catch (e) {
      console.warn("Failed to add note", e);
    }

    // 3. Cycle card type dot
    const nextType = NEXT_TYPE_CYCLE[cardType] || "question";
    setCardType(nextType);

    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2200);
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
    if (idx < startIdx) {
      setStartIdx(idx);
      const newText = tokens.slice(idx, endIdx + 1).join(" ");
      setSelectedText(newText);
      runTranslation(newText, forcedTarget || undefined);
    } else if (idx > endIdx) {
      setEndIdx(idx);
      const newText = tokens.slice(startIdx, idx + 1).join(" ");
      setSelectedText(newText);
      runTranslation(newText, forcedTarget || undefined);
    } else {
      setStartIdx(idx);
      setEndIdx(idx);
      const newText = tokens[idx];
      setSelectedText(newText);
      runTranslation(newText, forcedTarget || undefined);
    }
  };

  // Core function to open dialog
  const openDialog = useCallback(
    (text: string, tokenList: string[], sIdx: number, eIdx: number, forceTarget?: "ar" | "en") => {
      const cleanText = cleanNaturalText(text) || text;
      if (!cleanText.trim()) return;

      setSelectedText(cleanText);
      setTokens(tokenList.length > 0 ? tokenList : cleanText.split(/\s+/).filter(Boolean));
      setStartIdx(Math.max(0, Math.min(sIdx, (tokenList.length || 1) - 1)));
      setEndIdx(Math.max(0, Math.min(eIdx, (tokenList.length || 1) - 1)));
      setIsOpen(true);
      setForcedTarget(forceTarget || null);
      setCopied(false);
      setSavedNote(false);
      setIsPlayingAudio(false);

      if (typeof window !== "undefined") {
        const win = window as unknown as { __fc_translation_active?: boolean };
        win.__fc_translation_active = true;
      }

      playMutedTick(1.1, 0.16);
      runTranslation(cleanText, forceTarget);
    },
    [runTranslation],
  );

  // Single-Tap / Drag Highlight Event Listener
  useEffect(() => {
    const handleWordHighlightEvent = (e: Event) => {
      const custom = e as CustomEvent<{
        word: string;
        tokens?: string[];
        tokenIndex?: number;
        startIdx?: number;
        endIdx?: number;
        forceTarget?: "ar" | "en";
      }>;

      if (!custom.detail || !custom.detail.word) return;

      const {
        word,
        tokens: wordTokens,
        tokenIndex = 0,
        startIdx: sIdx,
        endIdx: eIdx,
        forceTarget,
      } = custom.detail;
      const sentenceTokens = wordTokens && wordTokens.length > 0 ? wordTokens : [word];

      const finalStart = typeof sIdx === "number" ? sIdx : tokenIndex;
      const finalEnd = typeof eIdx === "number" ? eIdx : tokenIndex;

      openDialog(word, sentenceTokens, finalStart, finalEnd, forceTarget);
    };

    window.addEventListener("fc-highlight-word", handleWordHighlightEvent);
    return () => {
      window.removeEventListener("fc-highlight-word", handleWordHighlightEvent);
    };
  }, [openDialog]);

  // Broadcast active selection range to flashcard text for synchronized tick highlighting
  useEffect(() => {
    if (isOpen && tokens.length > 0) {
      window.dispatchEvent(
        new CustomEvent("fc-selection-range", {
          detail: { startIdx, endIdx },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("fc-selection-range", {
          detail: null,
        }),
      );
    }
  }, [isOpen, startIdx, endIdx, tokens.length]);

  // Handle native OS mouse and touch selection (including Android selection handles)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const handleSelectionEnd = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const rawText = selection.toString().trim();
        if (!rawText || rawText.length < 1) return;

        const anchorNode = selection.anchorNode;
        let parentEl: HTMLElement | null = null;
        if (anchorNode) {
          parentEl =
            anchorNode.nodeType === Node.ELEMENT_NODE
              ? (anchorNode as HTMLElement)
              : anchorNode.parentElement;
        }

        if (
          parentEl?.closest("[role='dialog']") ||
          parentEl?.closest("button") ||
          parentEl?.closest("input") ||
          parentEl?.closest("textarea")
        ) {
          return;
        }

        const clean = cleanNaturalText(rawText);
        if (!clean) return;

        const allTokens = clean.split(/\s+/).filter(Boolean);
        openDialog(clean, allTokens, 0, allTokens.length - 1);
      }, 120);
    };

    document.addEventListener("mouseup", handleSelectionEnd);
    document.addEventListener("touchend", handleSelectionEnd);
    document.addEventListener("selectionchange", handleSelectionEnd);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("mouseup", handleSelectionEnd);
      document.removeEventListener("touchend", handleSelectionEnd);
      document.removeEventListener("selectionchange", handleSelectionEnd);
    };
  }, [openDialog]);

  const handleCopy = () => {
    if (!selectedText) return;
    const toCopy = translation ? `${selectedText} — ${translation.text}` : selectedText;
    navigator.clipboard.writeText(toCopy);
    playCorrect();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwapLanguage = () => {
    const nextTarget = targetLang === "ar" ? "en" : "ar";
    setForcedTarget(nextTarget);
    if (selectedText) {
      runTranslation(selectedText, nextTarget);
    }
  };

  if (!isOpen || !selectedText) {
    return null;
  }

  return (
    <>
      {/* Sleek Non-Blocking Floating Action Toolbar — Floating over flashcard without modal backdrop window */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-1.25rem)] max-w-md pointer-events-auto shadow-2xl animate-in slide-in-from-bottom-5 duration-200 select-none"
        role="toolbar"
        aria-label="Selection Actions"
      >
        <div
          ref={barRef}
          className="w-full rounded-2xl border border-primary/30 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-2xl p-3 space-y-2.5"
        >
          {/* Top Info Bar: Highlighted Text Snippet + Live Translation + Close */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/40">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="p-1 rounded-md bg-primary/15 text-primary shrink-0">
                <Sparkles className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  dir={isArabicDetected ? "rtl" : "ltr"}
                  className={cn(
                    "text-xs sm:text-sm font-bold text-foreground truncate",
                    isArabicDetected && "font-serif",
                  )}
                >
                  {selectedText}
                </div>
                {isLoading ? (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin text-primary" />
                    <span>Translating...</span>
                  </div>
                ) : translation ? (
                  <div
                    dir={targetLang === "ar" ? "rtl" : "ltr"}
                    className={cn(
                      "text-[11px] font-semibold text-primary truncate",
                      targetLang === "ar" && "font-serif",
                    )}
                  >
                    {translation.text}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  playMutedTick(1.0, 0.15);
                  handleSwapLanguage();
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-secondary hover:bg-secondary/80 text-foreground transition-all border border-border/40 active:scale-95 cursor-pointer"
                title="Swap translation language"
              >
                <span>{detectedLang.toUpperCase()}</span>
                <ArrowLeftRight className="size-2.5 text-muted-foreground" />
                <span>{targetLang.toUpperCase()}</span>
              </button>

              <button
                type="button"
                onClick={clearSelectionState}
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-all cursor-pointer active:scale-90"
                title="Deselect & close"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Core Action Buttons: Translate, Write 3×, Fact Check Dot */}
          <div className="grid grid-cols-3 gap-2">
            {/* 🌐 Translate Button */}
            <button
              type="button"
              onClick={() => {
                playMutedTick(1.0, 0.14);
                handleSwapLanguage();
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-all cursor-pointer active:scale-95 shadow-2xs"
              title="Translate between English and Arabic"
            >
              <Languages className="size-3.5 text-primary" />
              <span>Translate</span>
            </button>

            {/* ✍️ Write 3 Times Practice */}
            <button
              type="button"
              onClick={() => {
                playMutedTick(1.0, 0.14);
                stopAllAudio();
                setIsWriteModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border/50 transition-all cursor-pointer active:scale-95 shadow-2xs"
              title="Practice writing this text 3 times"
            >
              <PenTool className="size-3.5 text-primary" />
              <span>Write 3×</span>
            </button>

            {/* 🟢 Fact Check Dot Button (Auto-writes Note to Card!) */}
            <button
              type="button"
              onClick={() => {
                playMutedTick(1.0, 0.14);
                handleAutoFactCheck();
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 shadow-2xs",
                savedNote
                  ? "bg-emerald-500 text-white border-emerald-600 font-extrabold"
                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
              )}
              title="Automatically add fact check note to card and cycle classification dot"
            >
              {savedNote ? (
                <>
                  <Check className="size-3.5 text-white animate-in zoom-in-75 duration-150" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <CardTypeDot
                    cardType={cardType}
                    editable={false}
                    showLabel={false}
                    className="scale-95"
                  />
                  <span>Fact Check</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Controls: Range Extension & Listen / Copy */}
          <div className="flex items-center justify-between pt-1 border-t border-border/30 text-xs px-1">
            {/* Word range refinement */}
            {tokens.length > 1 ? (
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={handleExtendLeft}
                  disabled={startIdx <= 0}
                  className="px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 border border-border/30 font-bold"
                >
                  <ChevronLeft className="size-3 text-primary inline" />
                  <span>Prev</span>
                </button>

                <span className="text-[10px] text-muted-foreground font-semibold px-1">
                  {endIdx - startIdx + 1}/{tokens.length} words
                </span>

                <button
                  type="button"
                  onClick={handleExtendRight}
                  disabled={endIdx >= tokens.length - 1}
                  className="px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 border border-border/30 font-bold"
                >
                  <span>Next</span>
                  <ChevronRight className="size-3 text-primary inline" />
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground italic font-medium">
                Single word
              </div>
            )}

            {/* Listen & Copy */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePlaySingleAudio(selectedText, detectedLang)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Listen to audio"
              >
                <Volume2 className="size-3 text-primary" />
                <span>Listen</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span className="text-emerald-500 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

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
