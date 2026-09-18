import React from "react";
import { Coffee, BookOpen } from "lucide-react";
import { SavedDeck, upsertSavedDeck } from "@/lib/flashcards";

interface DeckLabelToggleProps {
  savedDeck: SavedDeck;
  onUpdateDeck?: (updatedDeck: SavedDeck) => void;
}

export const DeckLabelToggle: React.FC<DeckLabelToggleProps> = ({ savedDeck, onUpdateDeck }) => {
  const isBreakDeck = savedDeck.deck?.deckType === "break";

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening the deck
    const newType: "study" | "break" = isBreakDeck ? "study" : "break";

    const updatedDeckObj = {
      ...savedDeck.deck,
      deckType: newType,
    };

    const updated = await upsertSavedDeck(updatedDeckObj, savedDeck.name, savedDeck.id);
    if (onUpdateDeck) {
      onUpdateDeck(updated);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      title="Click to toggle between Study Deck and Break Deck"
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
        isBreakDeck
          ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
          : "bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25"
      }`}
    >
      {isBreakDeck ? (
        <>
          <Coffee className="w-3.5 h-3.5 text-amber-400" />
          <span>Break Deck</span>
        </>
      ) : (
        <>
          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
          <span>Study Deck</span>
        </>
      )}
    </button>
  );
};
