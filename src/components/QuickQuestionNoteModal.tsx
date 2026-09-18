import React, { useState, useEffect, useRef } from "react";
import { X, Check, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardType, getCardType, cleanNaturalText } from "@/lib/flashcards";
import { playClick, playCorrect } from "@/lib/sounds";

interface QuickQuestionNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: Card | null;
  onSave: (updated: { cardType: CardType; note?: string; text?: string }) => void;
  initialType?: CardType;
}

export const QuickQuestionNoteModal: React.FC<QuickQuestionNoteModalProps> = ({
  isOpen,
  onClose,
  card,
  onSave,
  initialType,
}) => {
  const [selectedType, setSelectedType] = useState<CardType>("fact");
  const [noteText, setNoteText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen && card) {
      const type = initialType || getCardType(card) || "fact";
      setSelectedType(type);
      setNoteText(card.note ? cleanNaturalText(card.note) : "");

      // Smooth auto-focus for immediate keyboard pop-up
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, card, initialType]);

  if (!isOpen || !card) return null;

  const handleSave = () => {
    playCorrect();
    const cleanNote = cleanNaturalText(noteText);
    onSave({
      cardType: selectedType,
      note: cleanNote || undefined,
    });
    onClose();
  };

  const handleSkip = () => {
    playClick();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleSkip();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const cardDisplay = cleanNaturalText(card.text);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      {/* Backdrop with blur */}
      <div
        onClick={handleSkip}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Window */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xl shadow-primary/10 z-10 animate-in zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <StickyNote className="size-4" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                Card Classification & Note
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Type a question or note, or skip to continue
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkip}
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
            title="Skip / Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Card Preview Snippet */}
        <div
          className="my-3.5 p-3 rounded-xl bg-muted/40 border border-border/40 text-xs text-muted-foreground line-clamp-2 italic leading-relaxed"
          dir="auto"
        >
          &ldquo;{cardDisplay}&rdquo;
        </div>

        {/* Classification Type Selector Tabs */}
        <div className="space-y-1.5 mb-3">
          <label className="text-xs font-semibold text-foreground">Select Card Type</label>
          <div className="grid grid-cols-3 gap-2">
            {/* Note / Fact */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setSelectedType("fact");
                textareaRef.current?.focus();
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                selectedType === "fact" || selectedType === "note"
                  ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 ring-1 ring-emerald-400/40 shadow-xs"
                  : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span>Note</span>
            </button>

            {/* Question */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setSelectedType("question");
                textareaRef.current?.focus();
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                selectedType === "question"
                  ? "bg-sky-500/15 border-sky-500/50 text-sky-400 ring-1 ring-sky-400/40 shadow-xs"
                  : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="size-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              <span>Question</span>
            </button>

            {/* Quote */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setSelectedType("quote");
                textareaRef.current?.focus();
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                selectedType === "quote"
                  ? "bg-amber-500/15 border-amber-500/50 text-amber-400 ring-1 ring-amber-400/40 shadow-xs"
                  : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              <span>Quote</span>
            </button>
          </div>
        </div>

        {/* Note / Question Writing Area with Instant Auto-Focus */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground">
              {selectedType === "question"
                ? "Question / Prompt"
                : selectedType === "quote"
                  ? "Quote Context / Author"
                  : "Study Note / Takeaway"}
            </label>
            <span className="text-[11px] text-muted-foreground">Cmd+Enter to save</span>
          </div>
          <Textarea
            ref={textareaRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={
              selectedType === "question"
                ? "What question does this text answer? (e.g. What is the key mechanism?)"
                : selectedType === "quote"
                  ? "Add citation, speaker, or memorable quote summary..."
                  : "Add your personal takeaway, mnemonic, or key fact..."
            }
            className="min-h-24 resize-y bg-input/40 text-sm leading-relaxed focus-visible:ring-1"
            dir="auto"
          />
        </div>

        {/* Action Buttons: Skip vs Save */}
        <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            className="h-10 px-4 text-xs font-semibold text-muted-foreground hover:text-foreground active:scale-95"
          >
            Skip
          </Button>

          <div className="flex items-center gap-2">
            {noteText && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNoteText("");
                  textareaRef.current?.focus();
                }}
                className="h-10 px-3 text-xs text-muted-foreground hover:text-destructive"
              >
                Clear
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSave}
              className="h-10 px-5 gap-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm"
            >
              <Check className="size-3.5" />
              Save Note & Type
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
