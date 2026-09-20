import React, { useMemo } from "react";
import { cleanNaturalText } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

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

  const handleWordTap = (
    item: { word: string; cleanWord: string },
    index: number,
    e: React.MouseEvent<HTMLSpanElement>,
  ) => {
    e.stopPropagation();

    // If multi-word text was selected by drag, let standard selection listener handle it
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 1) {
      return;
    }

    const targetWord = item.cleanWord || item.word;
    if (!targetWord) return;

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();

    window.dispatchEvent(
      new CustomEvent("fc-highlight-word", {
        detail: {
          word: targetWord,
          tokens: cleanTokensList,
          tokenIndex: index,
          rect: {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
        },
      }),
    );
  };

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className={cn(
        "select-text text-xl sm:text-2xl font-medium leading-relaxed text-foreground animate-in fade-in duration-100",
        isArabic && "font-serif text-2xl sm:text-3xl",
        className,
      )}
    >
      {tokens.map((item, idx) => (
        <React.Fragment key={idx}>
          <span
            role="button"
            tabIndex={0}
            data-interactive-word="true"
            data-word-index={idx}
            onClick={(e) => handleWordTap(item, idx, e)}
            className="inline-block cursor-pointer rounded px-0.5 -mx-0.5 hover:bg-primary/15 hover:text-primary active:bg-primary/25 active:scale-95 transition-all select-text"
            title={`Tap to translate or repeat "${item.cleanWord}"`}
          >
            {item.word}
          </span>
          {item.trailingSpace}
        </React.Fragment>
      ))}
    </div>
  );
}
