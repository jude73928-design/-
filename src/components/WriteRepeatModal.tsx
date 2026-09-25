import React, { useState, useEffect, useRef, useCallback } from "react";
import { normalizeForCompare, isArabic } from "@/lib/flashcards";
import { speak as ttsSpeak, stopAllAudio, detectLang, type TtsHandle } from "@/lib/tts";
import { playCorrect, playClimax, playError } from "@/lib/sounds";
import {
  Volume2,
  VolumeX,
  X,
  Check,
  Sparkles,
  ArrowRight,
  Copy,
  Repeat,
  CornerDownLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface WriteRepeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetWord: string;
  targetLang?: "ar" | "en";
  fullCardText?: string;
  onComplete?: () => void;
}

export const WriteRepeatModal: React.FC<WriteRepeatModalProps> = ({
  isOpen,
  onClose,
  targetWord,
  targetLang,
  fullCardText,
  onComplete,
}) => {
  const [step, setStep] = useState(1);
  const [input, setInput] = useState("");
  const [isError, setIsError] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoopingAudio, setIsLoopingAudio] = useState(true);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioHandleRef = useRef<TtsHandle | null>(null);
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lang = targetLang || (isArabic(targetWord) ? "ar" : detectLang(targetWord));

  // Copy target text helper
  const handleCopyTarget = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(targetWord);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* ignore */
    }
  };

  // Quick 1-tap fill input helper for fast mobile workflow
  const handleFillInput = () => {
    setInput(targetWord);
    setIsError(false);
    setTimeout(() => {
      checkSolution(targetWord);
    }, 50);
  };

  // Continuous Audio Loop Effect (Only reads selected targetWord, stops all other tracks)
  useEffect(() => {
    let isActive = true;

    const runAudioLoop = async () => {
      if (!isOpen || isCompleted || !isLoopingAudio || !targetWord.trim()) return;

      // Stop any background card TTS or argument voice immediately
      stopAllAudio();

      setIsPlayingAudio(true);
      try {
        const handle = await ttsSpeak(targetWord, lang, 200, () => {
          if (isActive) setIsPlayingAudio(false);
        });
        audioHandleRef.current = handle;
        await handle.ended;

        if (isActive && isOpen && isLoopingAudio && !isCompleted) {
          setIsPlayingAudio(false);
          loopTimeoutRef.current = setTimeout(() => {
            if (isActive) void runAudioLoop();
          }, 700);
        }
      } catch (e) {
        if (isActive) setIsPlayingAudio(false);
      }
    };

    if (isOpen && isLoopingAudio && !isCompleted) {
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      void runAudioLoop();
    } else {
      audioHandleRef.current?.stop();
      setIsPlayingAudio(false);
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    }

    return () => {
      isActive = false;
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      audioHandleRef.current?.stop();
    };
  }, [isOpen, targetWord, lang, isLoopingAudio, isCompleted]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      stopAllAudio();
      setStep(1);
      setInput("");
      setIsError(false);
      setIsCompleted(false);
      setIsLoopingAudio(true);
      setCopied(false);

      // Autofocus input without jumping mobile viewport
      setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 100);
    } else {
      audioHandleRef.current?.stop();
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    }
    return () => {
      audioHandleRef.current?.stop();
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    };
  }, [isOpen, targetWord]);

  const checkSolution = useCallback(
    (valueToTest: string) => {
      if (!targetWord.trim()) return;
      const normalizedInput = normalizeForCompare(valueToTest);
      const normalizedTarget = normalizeForCompare(targetWord);

      if (normalizedInput === normalizedTarget) {
        setIsError(false);
        setInput("");

        if (step >= 3) {
          // Final 3rd repetition completed!
          setIsCompleted(true);
          playClimax();

          if (onComplete) onComplete();

          setTimeout(() => {
            onClose();
          }, 900);
        } else {
          // Steps 1 & 2
          playCorrect();
          setStep((s) => s + 1);
          setTimeout(() => {
            inputRef.current?.focus({ preventScroll: true });
          }, 50);
        }
      }
    },
    [targetWord, step, onComplete, onClose],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setIsError(false);
    checkSolution(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const normalizedInput = normalizeForCompare(input);
      const normalizedTarget = normalizeForCompare(targetWord);
      if (normalizedInput !== normalizedTarget) {
        playError();
        setIsError(true);
      } else {
        checkSolution(input);
      }
    }
  };

  const handleSkipOrSpoken = () => {
    playCorrect();
    if (step >= 3) {
      setIsCompleted(true);
      playClimax();
      if (onComplete) onComplete();
      setTimeout(() => onClose(), 600);
    } else {
      setStep((s) => s + 1);
      setInput("");
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/85 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto pt-2 sm:pt-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl sm:rounded-3xl border border-border/80 bg-card p-3.5 sm:p-5 text-card-foreground shadow-2xl animate-in zoom-in-95 duration-150 my-0 max-h-[calc(100dvh-1rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
              3×
            </span>
            <span className="text-sm font-bold text-foreground">Write to Master</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Audio Loop Toggle Button */}
            <button
              type="button"
              onClick={() => setIsLoopingAudio((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer border",
                isLoopingAudio
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-secondary text-muted-foreground border-border/50 hover:bg-secondary/80",
              )}
              title={
                isLoopingAudio
                  ? "Looping Audio ON — click to pause"
                  : "Audio Loop OFF — click to repeat"
              }
            >
              {isLoopingAudio ? (
                <>
                  <Repeat
                    className={cn("size-3.5 text-primary", isPlayingAudio && "animate-spin")}
                  />
                  <span>Looping</span>
                </>
              ) : (
                <>
                  <VolumeX className="size-3.5" />
                  <span>Muted</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Repetition Step Progress Dots */}
        <div className="my-2.5 flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Repetition:</span>
            <span className="text-xs font-bold text-primary">
              {isCompleted ? "3/3 Complete!" : `Step ${step} of 3`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "size-2.5 sm:size-3 rounded-full transition-all duration-300",
                  s < step || isCompleted
                    ? "bg-emerald-400 scale-110 shadow-xs shadow-emerald-500/50"
                    : s === step
                      ? "bg-primary scale-125 ring-2 ring-primary/40 animate-pulse"
                      : "bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
        </div>

        {/* Target Word Display (Compact & Sticky above input) */}
        <div className="mb-2 rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-center shadow-xs">
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
              Text to Write:
            </span>

            <div className="flex items-center gap-1">
              {/* Copy Button */}
              <button
                type="button"
                onClick={handleCopyTarget}
                className="inline-flex items-center gap-1 rounded-md bg-background hover:bg-background/90 border border-primary/20 px-2 py-0.5 text-[11px] font-semibold text-foreground transition-all cursor-pointer active:scale-95"
                title="Copy text to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="size-3 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3 text-primary" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {/* Quick Fill Button */}
              <button
                type="button"
                onClick={handleFillInput}
                className="inline-flex items-center gap-1 rounded-md bg-primary/20 hover:bg-primary/30 border border-primary/30 px-2 py-0.5 text-[11px] font-semibold text-primary transition-all cursor-pointer active:scale-95"
                title="Fill text into input field"
              >
                <CornerDownLeft className="size-3" />
                <span>Fill</span>
              </button>

              {/* Hear Button */}
              <button
                type="button"
                onClick={() => {
                  setIsLoopingAudio(true);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-primary/15 hover:bg-primary/25 px-2 py-0.5 text-[11px] font-semibold text-primary transition-all cursor-pointer"
                title="Hear text spoken"
              >
                <Volume2 className={cn("size-3", isPlayingAudio && "animate-bounce")} />
                <span>Hear</span>
              </button>
            </div>
          </div>

          <div
            dir={lang === "ar" ? "rtl" : "ltr"}
            className={cn(
              "text-lg sm:text-xl font-bold text-foreground tracking-wide break-words select-all py-1.5 px-2.5 rounded-lg bg-background/90 border border-border/50 shadow-inner leading-snug",
              lang === "ar" && "font-serif text-xl sm:text-2xl",
            )}
          >
            {targetWord}
          </div>
        </div>

        {/* Small Compact Field to See Live Writing Progress */}
        <div className="mb-2 rounded-lg bg-secondary/60 border border-border/50 px-2.5 py-1.5 text-xs font-mono">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-muted-foreground mb-0.5">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              <span>Being Written:</span>
            </span>
            <div className="flex items-center gap-1.5">
              {isError && (
                <span className="text-destructive font-bold text-[9px]">⚠️ Mismatch</span>
              )}
              <span className="text-primary font-bold">
                {input.length}/{targetWord.length}
              </span>
            </div>
          </div>

          {/* Clean continuous text rendering without individual letter boxes */}
          <div
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="font-mono text-sm sm:text-base font-bold tracking-wide text-foreground truncate py-0.5 px-1 bg-background/80 rounded border border-border/40"
          >
            {targetWord.split("").map((char, i) => {
              const typedChar = input[i];
              if (typedChar === undefined) {
                return (
                  <span key={i} className="text-muted-foreground/35">
                    {char}
                  </span>
                );
              }
              const isMatch = normalizeForCompare(typedChar) === normalizeForCompare(char);
              return (
                <span
                  key={i}
                  className={
                    isMatch
                      ? "text-emerald-400 font-extrabold"
                      : "text-rose-400 font-extrabold bg-rose-500/25 underline rounded-xs px-0.5"
                  }
                >
                  {typedChar}
                </span>
              );
            })}
          </div>
        </div>

        {/* Input Area */}
        <div className="space-y-2">
          <div className="relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type here to advance..."
              dir={lang === "ar" ? "rtl" : "ltr"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={cn(
                "h-11 sm:h-12 text-base sm:text-lg font-semibold rounded-xl sm:rounded-2xl px-3.5 transition-all shadow-inner",
                isError && "border-destructive ring-2 ring-destructive/30",
                isCompleted && "border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-500/10",
              )}
            />
            {isCompleted && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 flex items-center gap-1 text-xs font-bold">
                <Sparkles className="size-4 animate-bounce" />
                <span>Mastered!</span>
              </div>
            )}
          </div>

          {isError && (
            <p className="text-center text-xs text-destructive animate-shake font-medium">
              Not quite right — check spelling and try again.
            </p>
          )}

          {/* Quick Action Footer */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleSkipOrSpoken}
              className="text-xs text-muted-foreground hover:text-foreground font-medium underline underline-offset-4 cursor-pointer"
            >
              Skip / Said Out Loud ({step}/3)
            </button>

            <Button
              type="button"
              size="sm"
              onClick={() => checkSolution(input)}
              className="rounded-xl px-4 gap-1.5 font-semibold active:scale-95"
            >
              <span>Submit</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
