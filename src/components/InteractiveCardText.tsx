import React, { useMemo, useState, useEffect } from "react";
import { cleanNaturalText } from "@/lib/flashcards";
import { cn } from "@/lib/utils";
import { playMutedTick } from "@/lib/sounds";

interface InteractiveCardTextProps {
  text: string;
  isArabic: boolean;
  className?: string;
}

function parseInteractiveTokens(text: string) {
  const parts = text.split(/(\s+)/);
  const items: { word: string; cleanWord: string; trailingSpace: string }[] = [];
  let currentWord = "";

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^\s+$/.test(p)) {
      if (currentWord) {
        items.push({
          word: currentWord,
          cleanWord: currentWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") || currentWord,
          trailingSpace: p,
        });
        currentWord = "";
      } else if (items.length > 0) {
        items[items.length - 1].trailingSpace += p;
      }
    } else if (p) {
      if (currentWord) {
        items.push({
          word: currentWord,
          cleanWord: currentWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") || currentWord,
          trailingSpace: "",
        });
      }
      currentWord = p;
    }
  }
  if (currentWord) {
    items.push({
      word: currentWord,
      cleanWord: currentWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") || currentWord,
      trailingSpace: "",
    });
  }
  return items;
}

export function InteractiveCardText({ text, isArabic, className }: InteractiveCardTextProps) {
  const clean = cleanNaturalText(text) || text;
  const tokens = useMemo(() => parseInteractiveTokens(clean), [clean]);
  const cleanTokensList = useMemo(() => tokens.map((t) => t.cleanWord).filter(Boolean), [tokens]);

  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const handleRange = (e: Event) => {
      const custom = e as CustomEvent<{ startIdx: number; endIdx: number } | null>;
      if (!custom.detail) {
        setActiveRange(null);
      } else {
        setActiveRange({ start: custom.detail.startIdx, end: custom.detail.endIdx });
      }
    };
    window.addEventListener("fc-selection-range", handleRange);
    return () => window.removeEventListener("fc-selection-range", handleRange);
  }, []);

  const len = clean.length;
  let fontClasses = "text-xl sm:text-2xl font-medium leading-relaxed";
  if (isArabic) {
    if (len <= 40) {
      fontClasses = "text-2.5xl sm:text-3.5xl font-serif font-bold leading-relaxed";
    } else if (len <= 90) {
      fontClasses = "text-xl sm:text-2.5xl font-serif font-medium leading-relaxed";
    } else if (len <= 160) {
      fontClasses = "text-lg sm:text-xl font-serif font-medium leading-snug";
    } else if (len <= 260) {
      fontClasses = "text-base sm:text-lg font-serif font-medium leading-snug";
    } else {
      fontClasses = "text-sm sm:text-base font-serif font-medium leading-normal";
    }
  } else {
    if (len <= 40) {
      fontClasses = "text-2xl sm:text-3xl font-semibold leading-relaxed";
    } else if (len <= 90) {
      fontClasses = "text-xl sm:text-2xl font-medium leading-relaxed";
    } else if (len <= 160) {
      fontClasses = "text-lg sm:text-xl font-medium leading-snug";
    } else if (len <= 260) {
      fontClasses = "text-base sm:text-lg font-medium leading-snug";
    } else {
      fontClasses = "text-sm sm:text-base font-medium leading-normal";
    }
  }

  const handleWordClick = (
    item: { word: string; cleanWord: string },
    index: number,
    e: React.MouseEvent<HTMLSpanElement>,
  ) => {
    // If the user has a native multi-word text selection active (e.g. via Android handles), respect native selection
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 1) {
      return;
    }

    const targetWord = item.cleanWord || item.word;
    if (!targetWord) return;

    playMutedTick(1.0, 0.12);
    window.dispatchEvent(
      new CustomEvent("fc-highlight-word", {
        detail: {
          word: targetWord,
          tokens: cleanTokensList,
          tokenIndex: index,
          startIdx: index,
          endIdx: index,
        },
      }),
    );
  };

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className={cn(
        "select-text text-foreground animate-in fade-in duration-100 break-words touch-auto",
        fontClasses,
        className,
      )}
    >
      {tokens.map((item, idx) => {
        const isHighlighted =
          activeRange !== null && idx >= activeRange.start && idx <= activeRange.end;
        return (
          <React.Fragment key={idx}>
            <span
              data-interactive-word="true"
              data-word-index={idx}
              onClick={(e) => handleWordClick(item, idx, e)}
              className={cn(
                "inline-block cursor-pointer rounded-md px-1 -mx-0.5 transition-all duration-150 select-text",
                isHighlighted
                  ? "bg-primary/25 text-primary font-bold ring-1.5 ring-primary/45 shadow-2xs scale-[1.02] z-10 relative"
                  : "hover:bg-primary/15 hover:text-primary active:bg-primary/25 active:scale-95",
              )}
              title={`Tap or select "${item.cleanWord}"`}
            >
              {item.word}
            </span>
            {item.trailingSpace}
          </React.Fragment>
        );
      })}
    </div>
  );
}
