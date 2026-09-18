import React, { useState, useEffect, useRef, useCallback } from "react";
import { normalizeForCompare, isArabic } from "@/lib/flashcards";
import { speak as ttsSpeak, detectLang, type TtsHandle } from "@/lib/tts";
import { playClick, playCorrect, playClimax, playError } from "@/lib/sounds";
import { Volume2, X, Check, Sparkles, ArrowRight } from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const audioHandleRef = useRef<TtsHandle | null>(null);

  const lang = targetLang || (isArabic(targetWord) ? "ar" : detectLang(targetWord));

  const handleSpeak = useCallback(
    async (text: string) => {
      audioHandleRef.current?.stop();
      setIsPlayingAudio(true);
      try {
        const handle = await ttsSpeak(text, lang, 200, () => {
          setIsPlayingAudio(false);
        });
        audioHandleRef.current = handle;
        await handle.ended;
      } catch (e) {
        console.warn("TTS failed in modal", e);
      } finally {
        setIsPlayingAudio(false);
      }
    },
    [lang],
  );

  // Reset state when opened or targetWord changes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setInput("");
      setIsError(false);
      setIsCompleted(false);
      setIsPlayingAudio(false);
      // Play target word once on open
      void handleSpeak(targetWord);
      // Autofocus input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      audioHandleRef.current?.stop();
    }
    return () => {
      audioHandleRef.current?.stop();
    };
  }, [isOpen, targetWord, handleSpeak]);

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
          // Repeat full card or phrase through TTS
          const textToRepeat = fullCardText || targetWord;
          void handleSpeak(textToRepeat);

          if (onComplete) onComplete();

          setTimeout(() => {
            onClose();
          }, 900);
        } else {
          // Steps 1 & 2
          playCorrect();
          // Repeat card through TTS each time solved
          const textToRepeat = fullCardText || targetWord;
          void handleSpeak(textToRepeat);
          setStep((s) => s + 1);
          setTimeout(() => {
            inputRef.current?.focus();
          }, 50);
        }
      }
    },
    [targetWord, step, fullCardText, handleSpeak, onComplete, onClose],
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
    const textToRepeat = fullCardText || targetWord;
    void handleSpeak(textToRepeat);
    if (step >= 3) {
      setIsCompleted(true);
      playClimax();
      if (fullCardText) void handleSpeak(fullCardText);
      if (onComplete) onComplete();
      setTimeout(() => onClose(), 600);
    } else {
      setStep((s) => s + 1);
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-border/80 bg-card p-5 sm:p-6 text-card-foreground shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
              3×
            </span>
            <span className="text-sm font-bold text-foreground">Write to Master</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Repetition Step Progress Dots */}
        <div className="my-4 flex items-center justify-between rounded-2xl bg-secondary/50 px-4 py-2.5">
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
                  "size-3 rounded-full transition-all duration-300",
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

        {/* Target Word Display */}
        <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Type this exact text:
            </span>
            <button
              type="button"
              onClick={() => handleSpeak(targetWord)}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary/80 transition-colors"
              title="Listen to pronunciation"
            >
              <Volume2 className={cn("size-3", isPlayingAudio && "text-primary animate-ping")} />
              <span>Hear</span>
            </button>
          </div>

          <div
            dir={lang === "ar" ? "rtl" : "ltr"}
            className={cn(
              "text-2xl font-bold text-primary tracking-wide break-words select-text",
              lang === "ar" && "font-serif text-3xl",
            )}
          >
            {targetWord}
          </div>
        </div>

        {/* Input Area */}
        <div className="space-y-3">
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
                "h-12 text-base sm:text-lg font-medium rounded-2xl px-4 transition-all shadow-inner",
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
            <p className="text-center text-xs text-destructive animate-shake">
              Not quite right — check spelling and try again.
            </p>
          )}

          {/* Quick Action Footer */}
          <div className="flex items-center justify-between pt-2">
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
