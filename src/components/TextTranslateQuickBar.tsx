import React, { useState, useRef } from "react";
import { detectLanguage, batchTranslate } from "@/services/translator";
import {
  Languages,
  ArrowLeftRight,
  Loader2,
  Sparkles,
  RotateCcw,
  Maximize2,
  Check,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullTextTranslateModal } from "@/components/FullTextTranslateModal";

export interface TextTranslateQuickBarProps {
  text: string;
  onTextChange: (newText: string) => void;
  disabled?: boolean;
  deckName?: string;
  className?: string;
}

export function TextTranslateQuickBar({
  text,
  onTextChange,
  disabled = false,
  deckName,
  className = "",
}: TextTranslateQuickBarProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [previousText, setPreviousText] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<"ar" | "en" | null>(null);
  const [justTranslated, setJustTranslated] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const detectedLang = text.trim() ? detectLanguage(text) : "en";
  const defaultTarget = detectedLang === "ar" ? "en" : "ar";
  const targetLang = overrideTarget || defaultTarget;
  const sourceLang = targetLang === "ar" ? "en" : "ar";

  const handleSwapDirection = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOverrideTarget(targetLang === "ar" ? "en" : "ar");
  };

  const handleTranslateAll = async () => {
    if (!text.trim() || isTranslating) return;

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setIsTranslating(true);
    setProgress({ completed: 0, total: 0 });
    const original = text;

    try {
      const res = await batchTranslate(text, {
        sourceLang,
        targetLang,
        concurrency: 6,
        signal: ac.signal,
        onProgress: (completed, total) => {
          if (!ac.signal.aborted) {
            setProgress({ completed, total });
          }
        },
      });

      if (!ac.signal.aborted && res.translatedText) {
        setPreviousText(original);
        onTextChange(res.translatedText);
        setJustTranslated(true);
        setTimeout(() => setJustTranslated(false), 3000);
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        console.error("Quick translate error", err);
      }
    } finally {
      if (!ac.signal.aborted) {
        setIsTranslating(false);
      }
    }
  };

  const handleRevert = () => {
    if (previousText !== null) {
      onTextChange(previousText);
      setPreviousText(null);
    }
  };

  if (!text.trim()) {
    return null;
  }

  const isArSource = sourceLang === "ar";

  return (
    <>
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground transition-all ${className}`.trim()}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 font-medium text-muted-foreground">
            <Languages className="size-3.5 text-primary" />
            <span>Detected:</span>
            <span className="font-semibold text-foreground">
              {detectedLang === "ar" ? "Arabic (العربية)" : "English"}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border bg-background/80 px-1.5 py-0.5 font-mono text-[11px]">
            <span>{sourceLang.toUpperCase()}</span>
            <button
              type="button"
              onClick={handleSwapDirection}
              disabled={isTranslating}
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
              title="Swap translation direction"
            >
              <ArrowLeftRight className="size-3" />
            </button>
            <span>{targetLang.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previousText !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRevert}
              className="h-7 gap-1 px-2 text-xs border-dashed"
              title="Undo translation and restore original text"
            >
              <RotateCcw className="size-3" />
              <span>Undo Translate</span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={handleTranslateAll}
            disabled={disabled || isTranslating}
            className="h-7 gap-1.5 px-3 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isTranslating ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                <span>
                  Translating (
                  {progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%)
                </span>
              </>
            ) : justTranslated ? (
              <>
                <Check className="size-3 text-emerald-300" />
                <span>Translated!</span>
              </>
            ) : (
              <>
                <Sparkles className="size-3" />
                <span>
                  {targetLang === "ar"
                    ? "Translate to Arabic · ترجم للعربية"
                    : "Translate to English · ترجم للإنجليزية"}
                </span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="h-7 px-1.5 text-muted-foreground hover:text-foreground"
            title="Open Full Translator with side-by-side view"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>

        {isTranslating && progress.total > 0 && (
          <div className="mt-1 w-full">
            <div className="h-1 w-full overflow-hidden rounded-full bg-primary/20">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <FullTextTranslateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialText={text}
        deckName={deckName}
        onApplyTranslation={(translated, mode) => {
          if (mode === "replace") {
            setPreviousText(text);
            onTextChange(translated);
          } else if (mode === "append") {
            setPreviousText(text);
            onTextChange(`${text}\n\n---\n\n${translated}`);
          }
        }}
      />
    </>
  );
}
