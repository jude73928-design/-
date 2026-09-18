import React, { useState, useEffect, useRef } from "react";
import { detectLanguage, batchTranslate } from "@/services/translator";
import { speak, type TtsHandle } from "@/lib/tts";
import {
  Languages,
  ArrowLeftRight,
  Loader2,
  Copy,
  Check,
  X,
  Volume2,
  FileText,
  Sparkles,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FullTextTranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  deckName?: string;
  onApplyTranslation?: (translatedText: string, mode: "replace" | "append" | "newDeck") => void;
}

export function FullTextTranslateModal({
  isOpen,
  onClose,
  initialText,
  deckName,
  onApplyTranslation,
}: FullTextTranslateModalProps) {
  const [sourceLang, setSourceLang] = useState<"ar" | "en">("en");
  const [targetLang, setTargetLang] = useState<"ar" | "en">("ar");
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [translatedText, setTranslatedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeTab, setActiveTab] = useState<"sideBySide" | "translated" | "original">(
    "translated",
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioHandleRef = useRef<TtsHandle | null>(null);

  // Initialize language detection when opened with text
  useEffect(() => {
    if (isOpen && initialText.trim()) {
      const detected = detectLanguage(initialText);
      setSourceLang(detected);
      setTargetLang(detected === "ar" ? "en" : "ar");
      setTranslatedText("");
      setProgress({ completed: 0, total: 0 });
      setCopied(false);
    }
  }, [isOpen, initialText]);

  // Clean up on unmount or close
  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      audioHandleRef.current?.stop();
      setIsPlayingAudio(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSwap = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  const handleStartTranslate = async () => {
    if (!initialText.trim()) return;
    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setIsTranslating(true);
    setProgress({ completed: 0, total: 0 });
    setTranslatedText("");

    try {
      const res = await batchTranslate(initialText, {
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

      if (!ac.signal.aborted) {
        setTranslatedText(res.translatedText);
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        console.error("Batch translation error", e);
      }
    } finally {
      if (!ac.signal.aborted) {
        setIsTranslating(false);
      }
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handlePlayAudio = async (text: string, lang: "ar" | "en") => {
    audioHandleRef.current?.stop();
    setIsPlayingAudio(true);
    try {
      const handle = await speak(text.slice(0, 1000), lang, 180, () => {});
      audioHandleRef.current = handle;
      await handle.ended;
    } catch (e) {
      console.error("Audio playback error", e);
    } finally {
      setIsPlayingAudio(false);
    }
  };

  const sourceIsAr = sourceLang === "ar";
  const targetIsAr = targetLang === "ar";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-2xl text-card-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Languages className="size-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Full Text Translator · ترجمة النص بالكامل
              </h2>
              <p className="text-xs text-muted-foreground">
                {deckName ? `Deck: ${deckName}` : "High-speed Arabic ↔ English translation"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Translation Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Language Direction:</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
              <span className={sourceIsAr ? "font-serif font-bold text-primary" : "font-semibold"}>
                {sourceIsAr ? "العربية (Arabic)" : "English (إنجليزية)"}
              </span>
              <button
                type="button"
                onClick={handleSwap}
                disabled={isTranslating}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
                title="Swap translation direction"
              >
                <ArrowLeftRight className="size-3.5" />
              </button>
              <span className={targetIsAr ? "font-serif font-bold text-primary" : "font-semibold"}>
                {targetIsAr ? "العربية (Arabic)" : "English (إنجليزية)"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleStartTranslate}
              disabled={isTranslating || !initialText.trim()}
              className="gap-1.5 font-semibold shadow-sm"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Translating...</span>
                </>
              ) : translatedText ? (
                <>
                  <RefreshCw className="size-4" />
                  <span>Re-Translate</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  <span>Translate Entire Text</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Progress bar when translating */}
        {isTranslating && (
          <div className="border-b border-border/40 bg-primary/5 px-5 py-3 text-center animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-medium text-primary mb-1.5">
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                Translating chunk {progress.completed} of {progress.total}...
              </span>
              <span>
                {progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: progress.total ? `${(progress.completed / progress.total) * 100}%` : "25%",
                }}
              />
            </div>
          </div>
        )}

        {/* Content Tabs (when translated) */}
        {translatedText && (
          <div className="flex items-center gap-1 border-b border-border/60 px-5 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("translated")}
              className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "translated"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Translated ({targetLang.toUpperCase()})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sideBySide")}
              className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "sideBySide"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Side-by-Side View
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("original")}
              className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "original"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Original ({sourceLang.toUpperCase()})
            </button>
          </div>
        )}

        {/* Body Text Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {!translatedText && !isTranslating ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">
                  Original Source Text ({initialText.split(/\s+/).filter(Boolean).length} words):
                </span>
                <span>Language: {sourceIsAr ? "Arabic" : "English"}</span>
              </div>
              <div
                dir={sourceIsAr ? "rtl" : "ltr"}
                className={`max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-input/20 p-4 text-sm whitespace-pre-wrap leading-relaxed ${
                  sourceIsAr ? "font-serif text-base" : ""
                }`}
              >
                {initialText || "No text provided."}
              </div>
              <p className="text-center text-xs text-muted-foreground pt-2">
                Click <strong>"Translate Entire Text"</strong> above to translate everything into{" "}
                {targetIsAr ? "Arabic (العربية)" : "English"}.
              </p>
            </div>
          ) : activeTab === "translated" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-primary">
                  Translated Text ({targetIsAr ? "العربية" : "English"}):
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(translatedText, targetLang)}
                    disabled={isPlayingAudio}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-1 text-xs hover:bg-secondary text-secondary-foreground"
                  >
                    <Volume2
                      className={`size-3.5 ${isPlayingAudio ? "text-primary animate-pulse" : ""}`}
                    />
                    <span>Listen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(translatedText)}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-1 text-xs hover:bg-secondary text-secondary-foreground"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
              </div>
              <div
                dir={targetIsAr ? "rtl" : "ltr"}
                className={`max-h-80 overflow-y-auto rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm whitespace-pre-wrap leading-relaxed ${
                  targetIsAr ? "font-serif text-base" : ""
                }`}
              >
                {translatedText}
              </div>
            </div>
          ) : activeTab === "sideBySide" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Original ({sourceLang.toUpperCase()}):
                </span>
                <div
                  dir={sourceIsAr ? "rtl" : "ltr"}
                  className="max-h-80 overflow-y-auto rounded-xl border border-border bg-input/20 p-3 text-xs whitespace-pre-wrap leading-relaxed"
                >
                  {initialText}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-semibold text-primary">
                  Translated ({targetLang.toUpperCase()}):
                </span>
                <div
                  dir={targetIsAr ? "rtl" : "ltr"}
                  className="max-h-80 overflow-y-auto rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs whitespace-pre-wrap leading-relaxed"
                >
                  {translatedText}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground">Original Text:</span>
              <div
                dir={sourceIsAr ? "rtl" : "ltr"}
                className="max-h-80 overflow-y-auto rounded-xl border border-border bg-input/20 p-4 text-sm whitespace-pre-wrap leading-relaxed"
              >
                {initialText}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 bg-card">
          <div className="flex items-center gap-2">
            {translatedText && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(translatedText)}
                className="gap-1.5"
              >
                {copied ? (
                  <Check className="size-4 text-emerald-400" />
                ) : (
                  <Copy className="size-4" />
                )}
                <span>{copied ? "Copied" : "Copy Translation"}</span>
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onApplyTranslation && translatedText && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onApplyTranslation(translatedText, "append");
                    onClose();
                  }}
                  className="gap-1.5"
                >
                  <Plus className="size-4" />
                  <span>Append to Text</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onApplyTranslation(translatedText, "replace");
                    onClose();
                  }}
                  className="gap-1.5 font-semibold"
                >
                  <FileText className="size-4" />
                  <span>Replace with Translation</span>
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
