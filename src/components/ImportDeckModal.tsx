import React, { useState } from "react";
import { Coffee, BookOpen, Upload, FileText, X } from "lucide-react";
import { SavedDeck, buildDeck, upsertSavedDeck, parseImportedJsonData } from "@/lib/flashcards";
import { Button } from "@/components/ui/button";
import { TextTranslateQuickBar } from "@/components/TextTranslateQuickBar";

interface ImportDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (importedDecks: SavedDeck[]) => void;
}

export const ImportDeckModal: React.FC<ImportDeckModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [deckName, setDeckName] = useState("");
  const [rawText, setRawText] = useState("");
  const [deckType, setDeckType] = useState<"study" | "break">("study");
  const [jsonDecks, setJsonDecks] = useState<SavedDeck[] | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Auto-detect break tag from file name
    if (/break/i.test(file.name)) {
      setDeckType("break");
    }
    if (!deckName) {
      setDeckName(file.name.replace(/\.[^/.]+$/, ""));
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = (event.target?.result as string) || "";
      if (file.name.endsWith(".json")) {
        const parsed = parseImportedJsonData(content);
        if (parsed.length > 0) {
          setJsonDecks(parsed);
          setRawText(content);
        }
      } else {
        setJsonDecks(null);
        setRawText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveImport = async () => {
    if (jsonDecks && jsonDecks.length > 0) {
      const savedList: SavedDeck[] = [];
      for (const d of jsonDecks) {
        const updatedDeck = {
          ...d.deck,
          deckType: d.deck.deckType || deckType,
        };
        const saved = await upsertSavedDeck(updatedDeck, d.name, d.id);
        savedList.push(saved);
      }
      onImportComplete(savedList);
      onClose();
      return;
    }

    if (!deckName.trim() || !rawText.trim()) return;

    const autoBreak = /\[break\]|\(break\)|break deck|break notes/i.test(deckName);
    const finalType = autoBreak ? "break" : deckType;

    const built = buildDeck(rawText, 30);
    built.deckType = finalType;

    const saved = await upsertSavedDeck(built, deckName.trim());
    onImportComplete([saved]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-slate-100 shadow-2xl relative">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-400" />
            Import New Deck
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-100"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Deck Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Deck Title</label>
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="e.g., Quick Mindful Quiz [Break]"
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Deck Purpose / Type Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">Deck Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDeckType("study")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                deckType === "study"
                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-200"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"
              }`}
            >
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span>Study Deck (Normal)</span>
            </button>

            <button
              type="button"
              onClick={() => setDeckType("break")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                deckType === "break"
                  ? "bg-amber-600/20 border-amber-500 text-amber-200"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"
              }`}
            >
              <Coffee className="w-4 h-4 text-amber-400" />
              <span>Break Deck (Break Only)</span>
            </button>
          </div>
        </div>

        {/* File Upload Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Upload File (.txt / .csv / .json)
          </label>
          <input
            type="file"
            accept=".txt,.csv,.json"
            onChange={handleFileUpload}
            className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
          />
        </div>

        {/* Text Paste Area */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Or Paste Raw Text / Notes
          </label>
          {rawText.trim() && !jsonDecks && (
            <TextTranslateQuickBar
              text={rawText}
              onTextChange={(newText) => setRawText(newText)}
              deckName={deckName}
              className="mb-2 bg-slate-800/80 border-slate-700 text-slate-200"
            />
          )}
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste raw study notes or CSV here..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 font-mono resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs text-slate-400">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSaveImport}
            disabled={!rawText.trim() && !jsonDecks}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 rounded-xl"
          >
            Import Deck
          </Button>
        </div>
      </div>
    </div>
  );
};
