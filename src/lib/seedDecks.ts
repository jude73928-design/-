import type { SavedDeck } from "./flashcards";

import ben from "./decks/ben.json";
import bibi from "./decks/bibi.json";
import doug from "./decks/doug.json";
import fulPal from "./decks/ful_pal.json";
import gaad from "./decks/gaad.json";
import isDeck from "./decks/is.json";
import palFactCheck from "./decks/pal_fact_check.json";
import palIdeas from "./decks/pal_ideas.json";
import paper from "./decks/paper.json";
import pat from "./decks/pat.json";

export const HISTORICAL_MIRROR_DECK: SavedDeck = {
  id: "deck-al-maraya-al-tarikhiya",
  name: "المراية التاريخية: حودة ومستر سردية",
  updatedAt: 1726900000000,
  deck: (palIdeas as { deck?: SavedDeck["deck"] }).deck || {
    name: "المراية التاريخية: حودة ومستر سردية",
    sourceText: "المراية التاريخية: حودة ومستر سردية",
    maxWords: 40,
    cards: [],
  },
};

export const SEED_DECKS: SavedDeck[] = [
  HISTORICAL_MIRROR_DECK,
  ben as unknown as SavedDeck,
  bibi as unknown as SavedDeck,
  doug as unknown as SavedDeck,
  fulPal as unknown as SavedDeck,
  gaad as unknown as SavedDeck,
  isDeck as unknown as SavedDeck,
  palFactCheck as unknown as SavedDeck,
  palIdeas as unknown as SavedDeck,
  paper as unknown as SavedDeck,
  pat as unknown as SavedDeck,
];
