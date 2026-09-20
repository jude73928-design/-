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
  StickyNote,
  Pause,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { translatePhrase, type TranslationResult } from "@/services/translator";
import { cleanNaturalText } from "@/lib/flashcards";
import { detectLang as detectLanguage } from "@/lib/tts";
import { cn } from "@/lib/utils";
import { speak, speakRepeat, type TtsHandle } from "@/lib/tts";
import { WriteRepeatModal } from "./WriteRepeatModal";
import { playMutedTick, playCorrect } from "@/lib/sounds";

export function HighlightTranslateTooltip() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [forcedTarget, setForcedTarget] = useState<"ar" | "en" | null>(null);
  const [activeTab, setActiveTab] = useState<"repeat" | "translate">("repeat");

  // Audio Playback & Repeat Loop State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [repeatIteration, setRepeatIteration] = useState<number | null>(null);
  const [repeatCount, setRepeatCount] = useState<1 | 3 | 5>(3);
  const [repeatTarget, setRepeatTarget] = useState<"original" | "translated">("original");

  // Token Context State for word range extension
  const [tokens, setTokens] = useState<string[]>([]);
  const [startIdx, setStartIdx] = useState<number>(0);
  const [endIdx, setEndIdx] = useState<number>(0);

  // Writing practice modal state
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);

  // Refs for tracking
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioHandleRef = useRef<TtsHandle | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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
    setRepeatIteration(null);
    setTokens([]);
    setStartIdx(0);
    setEndIdx(0);

    if (typeof window !== "undefined") {
      const win = window as unknown as {
        __fc_translation_active?: boolean;
        __fc_dismissed_until?: number;
      };
      win.__fc_translation_active = false;
      win.__fc_dismissed_until = 0;
    }
  }, []);

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

  // Repeat Audio loop
  const handlePlayRepeatAudio = useCallback(
    async (textToSpeak: string, lang: "ar" | "en", count: 1 | 3 | 5) => {
      audioHandleRef.current?.stop();
      setIsPlayingAudio(true);
      setRepeatIteration(1);

      try {
        const handle = await speakRepeat(
          textToSpeak,
          lang,
          count,
          250,
          (currentIteration) => {
            setRepeatIteration(currentIteration);
          },
          () => {
            setIsPlayingAudio(false);
            setRepeatIteration(null);
          },
        );
        audioHandleRef.current = handle;
        await handle.ended;
      } catch (e) {
        console.error("Repeat audio playback error", e);
      } finally {
        setIsPlayingAudio(false);
        setRepeatIteration(null);
      }
    },
    [],
  );

  const handleStopAudio = useCallback(() => {
    audioHandleRef.current?.stop();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setRepeatIteration(null);
  }, []);

  const handleTogglePlayRepeat = useCallback(
    (textToSpeak: string, lang: "ar" | "en") => {
      if (isPlayingAudio) {
        handleStopAudio();
      } else {
        void handlePlayRepeatAudio(textToSpeak, lang, repeatCount);
      }
    },
    [isPlayingAudio, handleStopAudio, handlePlayRepeatAudio, repeatCount],
  );

  // Single Audio Playback
  const handlePlaySingleAudio = useCallback(async (textToSpeak: string, lang: "ar" | "en") => {
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
      setRepeatIteration(null);

      if (typeof window !== "undefined") {
        const win = window as unknown as { __fc_translation_active?: boolean };
        win.__fc_translation_active = true;
      }

      playMutedTick(1.1, 0.16);
      runTranslation(cleanText, forceTarget);
    },
    [runTranslation],
  );

  // Single-Tap on Word and Custom Highlight Event Listener
  useEffect(() => {
    const handleWordHighlightEvent = (e: Event) => {
      const custom = e as CustomEvent<{
        word: string;
        tokens?: string[];
        tokenIndex?: number;
        forceTarget?: "ar" | "en";
      }>;

      if (!custom.detail || !custom.detail.word) return;

      const { word, tokens: wordTokens, tokenIndex = 0, forceTarget } = custom.detail;
      const sentenceTokens = wordTokens && wordTokens.length > 0 ? wordTokens : [word];

      openDialog(word, sentenceTokens, tokenIndex, tokenIndex, forceTarget);
    };

    window.addEventListener("fc-highlight-word", handleWordHighlightEvent);
    return () => {
      window.removeEventListener("fc-highlight-word", handleWordHighlightEvent);
    };
  }, [openDialog]);

  // Handle standard mouse selection
  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(() => {
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
      }, 10);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
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

  const textToRepeat =
    repeatTarget === "translated" && translation ? translation.text : selectedText;
  const langToRepeat =
    repeatTarget === "translated" && translation ? translation.targetLang : detectedLang;

  if (!isOpen || !selectedText) {
    return null;
  }

  return (
    <>
      {/* Centered / Docked Modal Container with Outside-Click Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2.5 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150 select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            clearSelectionState();
          }
        }}
        role="presentation"
      >
        <div
          ref={modalRef}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[380px] rounded-2xl border border-border/80 bg-popover/98 text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[85vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Choose words to repeat"
        >
          {/* Header Row: Title & Cancel Button */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/40 bg-card/60">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <RotateCcw className="size-3.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-foreground leading-tight truncate">
                  Choose words to repeat
                </h3>
                <p className="text-[10px] text-muted-foreground truncate">
                  Tap words to select what to repeat or practice
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearSelectionState();
              }}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors cursor-pointer active:scale-95"
              title="Cancel & close"
              aria-label="Cancel"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-3 space-y-2.5 overflow-y-auto flex-1 text-xs">
            {/* Word Selection Chips & Range Controls */}
            {tokens.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-secondary/30 p-2 space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-muted-foreground">
                    Words ({endIdx - startIdx + 1}/{tokens.length}):
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        playMutedTick(1.0, 0.12);
                        handleSelectWordOnly();
                      }}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold transition-all cursor-pointer",
                        startIdx === endIdx
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-secondary text-muted-foreground hover:text-foreground",
                      )}
                    >
                      1 Word
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playMutedTick(1.1, 0.12);
                        handleSelectFullSentence();
                      }}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold transition-all cursor-pointer",
                        startIdx === 0 && endIdx === tokens.length - 1
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-secondary text-muted-foreground hover:text-foreground",
                      )}
                    >
                      All
                    </button>
                  </div>
                </div>

                {/* Tappable Words */}
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto py-0.5">
                  {tokens.map((tok, idx) => {
                    const isSel = idx >= startIdx && idx <= endIdx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          playMutedTick(1.0, 0.14);
                          handleTokenClick(idx);
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer truncate max-w-[130px]",
                          isSel
                            ? "bg-primary text-primary-foreground font-bold shadow-2xs scale-[1.02]"
                            : "bg-card border border-border/50 text-foreground hover:bg-secondary active:scale-95",
                        )}
                        title={`Select "${tok}"`}
                      >
                        {tok}
                      </button>
                    );
                  })}
                </div>

                {/* Range Expand Buttons */}
                {tokens.length > 1 && (
                  <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        playMutedTick(0.95, 0.12);
                        handleExtendLeft();
                      }}
                      disabled={startIdx <= 0}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                      <ChevronLeft className="size-2.5" />
                      <span>+ Prev</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playMutedTick(1.05, 0.12);
                        handleExtendRight();
                      }}
                      disabled={endIdx >= tokens.length - 1}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                      <span>Next +</span>
                      <ChevronRight className="size-2.5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Selected Phrase & Live Translation Box */}
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-primary flex items-center gap-1">
                  <Sparkles className="size-3" />
                  <span>Selected Text</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      playMutedTick(1.0, 0.15);
                      handleSwapLanguage();
                    }}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-secondary hover:bg-secondary/80 text-foreground cursor-pointer"
                    title="Swap translation direction"
                  >
                    <span>{detectedLang.toUpperCase()}</span>
                    <ArrowLeftRight className="size-2 text-muted-foreground" />
                    <span>{targetLang.toUpperCase()}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePlaySingleAudio(selectedText, detectedLang)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 cursor-pointer"
                    title="Listen once"
                  >
                    <Volume2 className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 cursor-pointer"
                    title="Copy text"
                  >
                    {copied ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Selected Phrase String */}
              <div
                dir={isArabicDetected ? "rtl" : "ltr"}
                className={cn(
                  "text-base font-bold text-foreground leading-snug break-words",
                  isArabicDetected && "font-serif text-lg",
                )}
              >
                {selectedText}
              </div>

              {/* Translation preview */}
              <div className="pt-1.5 border-t border-primary/10">
                {isLoading ? (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground py-0.5">
                    <Loader2 className="size-3 animate-spin text-primary" />
                    <span>Translating...</span>
                  </div>
                ) : translation ? (
                  <div
                    dir={targetLang === "ar" ? "rtl" : "ltr"}
                    className={cn(
                      "text-xs font-semibold text-foreground/90 leading-normal break-words",
                      targetLang === "ar" && "font-serif text-sm",
                    )}
                  >
                    {translation.text}
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground italic py-0.5">
                    Translation unavailable
                  </div>
                )}
              </div>
            </div>

            {/* Repeat Audio Section */}
            <div className="rounded-xl border border-border/60 bg-card p-2.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1 text-[11px]">
                  <RotateCcw className="size-3 text-primary" />
                  <span>Audio Repeat</span>
                </span>

                {/* Repeat multiplier pills: 1x, 3x, 5x */}
                <div className="flex items-center gap-0.5 bg-secondary/80 p-0.5 rounded-lg text-[10px] font-bold">
                  {([1, 3, 5] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        playMutedTick(1.0, 0.12);
                        setRepeatCount(cnt);
                        if (isPlayingAudio) {
                          void handlePlayRepeatAudio(textToRepeat, langToRepeat, cnt);
                        }
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer",
                        repeatCount === cnt
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {cnt}×
                    </button>
                  ))}
                </div>
              </div>

              {/* Target toggle: Original vs Translation */}
              {translation && (
                <div className="flex items-center gap-1 text-[10px] font-medium">
                  <span className="text-muted-foreground">Voice:</span>
                  <button
                    type="button"
                    onClick={() => {
                      playMutedTick(1.0, 0.1);
                      setRepeatTarget("original");
                    }}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer",
                      repeatTarget === "original"
                        ? "bg-secondary text-foreground font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Original ({detectedLang.toUpperCase()})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playMutedTick(1.0, 0.1);
                      setRepeatTarget("translated");
                    }}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer",
                      repeatTarget === "translated"
                        ? "bg-secondary text-foreground font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Translation ({targetLang.toUpperCase()})
                  </button>
                </div>
              )}

              {/* Main Repeat Play Button */}
              <button
                type="button"
                onClick={() => handleTogglePlayRepeat(textToRepeat, langToRepeat)}
                className={cn(
                  "w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98 shadow-xs",
                  isPlayingAudio
                    ? "bg-amber-500 text-white hover:bg-amber-600 animate-pulse"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {isPlayingAudio ? (
                  <>
                    <Pause className="size-3.5" />
                    <span>
                      Repeating {repeatIteration || 1}/{repeatCount} (Tap to Stop)
                    </span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-3.5" />
                    <span>
                      Play {repeatCount}× Repeat ({langToRepeat.toUpperCase()})
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer Actions: Save to Notes, Write 3x, Cancel & Done */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-border/40 bg-card/60 gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleAddToNotes}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer active:scale-95"
                title="Save to personal study notes"
              >
                {savedNote ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <StickyNote className="size-3" />
                )}
                <span>{savedNote ? "Saved" : "+ Note"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsWriteModalOpen(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all cursor-pointer active:scale-95"
                title="Practice writing 3×"
              >
                <PenTool className="size-3" />
                <span>Write 3×</span>
              </button>
            </div>

            {/* Action Buttons: Cancel and Done */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearSelectionState();
                }}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer active:scale-95"
                title="Cancel & close"
              >
                <X className="size-3" />
                <span>Cancel</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearSelectionState();
                }}
                className="flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-2xs active:scale-95"
                title="Finish & close"
              >
                <Check className="size-3" />
                <span>Done</span>
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
