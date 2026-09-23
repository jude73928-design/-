import React, { useState, useEffect } from "react";
import {
  Coffee,
  BookOpen,
  Upload,
  FileText,
  X,
  Clipboard,
  Layers,
  Check,
  Sparkles,
} from "lucide-react";
import {
  SavedDeck,
  buildDeck,
  upsertSavedDeck,
  parseImportedJsonData,
  parseTextToCards,
  importDecksBundle,
  listFolders,
  moveDeckToFolder,
  Folder,
} from "@/lib/flashcards";
import { Button } from "@/components/ui/button";
import { TextTranslateQuickBar } from "@/components/TextTranslateQuickBar";

interface ImportDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (importedDecks: SavedDeck[]) => void;
  defaultFolderId?: string | null;
}

export const ImportDeckModal: React.FC<ImportDeckModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  defaultFolderId,
}) => {
  const [deckName, setDeckName] = useState("");
  const [rawText, setRawText] = useState("");
  const [deckType, setDeckType] = useState<"study" | "break">("study");
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(
    defaultFolderId || undefined,
  );
  const [jsonDecks, setJsonDecks] = useState<SavedDeck[] | null>(null);
  const [detectedCardsCount, setDetectedCardsCount] = useState<number>(0);
  const [firstCardPreview, setFirstCardPreview] = useState<{ text: string; note?: string } | null>(
    null,
  );
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const folders: Folder[] = listFolders();

  const processImportText = (text: string) => {
    setRawText(text);
    const cleanStr = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    if (!cleanStr) {
      setJsonDecks(null);
      setDetectedCardsCount(0);
      setFirstCardPreview(null);
      return;
    }

    // First try JSON parsing
    const parsedJson = parseImportedJsonData(cleanStr);
    if (parsedJson.length > 0) {
      setJsonDecks(parsedJson);
      const totalCards = parsedJson.reduce((acc, d) => acc + (d.deck?.cards?.length || 0), 0);
      setDetectedCardsCount(totalCards);

      const firstCard = parsedJson[0]?.deck?.cards?.[0];
      if (firstCard) {
        setFirstCardPreview({ text: firstCard.text, note: firstCard.note });
      } else {
        setFirstCardPreview(null);
      }

      if (!deckName && parsedJson.length === 1) {
        setDeckName(parsedJson[0].name);
      }
    } else {
      // Non-JSON format: Parse text into structured cards (Q&A, TSV, CSV, paragraphs)
      setJsonDecks(null);
      const { cards, autoTitle } = parseTextToCards(cleanStr);
      setDetectedCardsCount(cards.length);
      if (cards.length > 0) {
        setFirstCardPreview({ text: cards[0].text, note: cards[0].note });
        if (!deckName && autoTitle) {
          setDeckName(autoTitle);
        }
      } else {
        setFirstCardPreview(null);
      }
    }
  };

  // Global window paste handler when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      // If user is focused on input/textarea, browser handles natively, but let's update state
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        setTimeout(() => {
          const val = (target as HTMLInputElement | HTMLTextAreaElement).value;
          if (val) processImportText(val);
        }, 50);
        return;
      }

      const pasted = e.clipboardData?.getData("text");
      if (pasted && pasted.trim()) {
        e.preventDefault();
        processImportText(pasted);
        setPasteNotice(`✓ Pasted clipboard content! (${pasted.length} chars)`);
        setTimeout(() => setPasteNotice(null), 3000);
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [isOpen, deckName]);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    processImportText(text);
  };

  const handle1ClickClipboardImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setPasteNotice(
          "Clipboard is empty or permissions blocked. Please press Ctrl+V directly into the text box.",
        );
        setTimeout(() => setPasteNotice(null), 4000);
        return;
      }
      processImportText(text);
      setPasteNotice(`✓ Successfully pasted ${text.length} characters from clipboard!`);
      setTimeout(() => setPasteNotice(null), 3500);
    } catch {
      setPasteNotice("📋 Click text box below & press Ctrl+V (or Cmd+V) to paste!");
      setTimeout(() => setPasteNotice(null), 4000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (/break/i.test(file.name)) {
      setDeckType("break");
    }
    if (!deckName) {
      setDeckName(file.name.replace(/\.[^/.]+$/, ""));
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = (event.target?.result as string) || "";
      processImportText(content);
    };
    reader.readAsText(file);
  };

  const handleSaveImport = async () => {
    // 1. If we have JSON decks
    if (jsonDecks && jsonDecks.length > 0) {
      const { importedDecks } = await importDecksBundle(rawText);
      const resultList: SavedDeck[] = [];

      for (const d of importedDecks.length > 0 ? importedDecks : jsonDecks) {
        const updatedDeck = {
          ...d.deck,
          deckType: d.deck.deckType || deckType,
          folderId: selectedFolderId || d.folderId || d.deck.folderId,
        };
        const saved = await upsertSavedDeck(updatedDeck, d.name, d.id);
        if (selectedFolderId) {
          await moveDeckToFolder(saved.id, selectedFolderId);
        }
        resultList.push(saved);
      }
      onImportComplete(resultList);
      onClose();
      return;
    }

    // 2. Fallback to raw text / structured Q&A / TSV
    if (!rawText.trim()) return;

    const { autoTitle } = parseTextToCards(rawText);
    const finalTitle = deckName.trim() || autoTitle || "Imported Study Deck";
    const autoBreak = /\[break\]|\(break\)|break deck|break notes/i.test(finalTitle);
    const finalType = autoBreak ? "break" : deckType;

    const built = buildDeck(rawText, 30);
    built.deckType = finalType;
    if (selectedFolderId) {
      built.folderId = selectedFolderId;
    }

    const saved = await upsertSavedDeck(built, finalTitle);
    if (selectedFolderId) {
      await moveDeckToFolder(saved.id, selectedFolderId);
    }
    onImportComplete([saved]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-slate-100 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-400" />
            Import Decks / Notes
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

        {/* Quick Clipboard 1-Click Action */}
        <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl p-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
              <Clipboard className="w-4 h-4 text-indigo-400" />
              1-Click Paste & Import
            </div>
            <p className="text-[11px] text-indigo-300/80">
              Copy any deck, JSON bundle, Q&A notes, or text — then click Paste!
            </p>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={handle1ClickClipboardImport}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 shadow-md"
          >
            <Clipboard className="w-3.5 h-3.5 mr-1.5" />
            Paste Clipboard
          </Button>
        </div>

        {pasteNotice && (
          <div className="text-xs font-medium text-emerald-300 bg-emerald-950/50 border border-emerald-700/80 rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm animate-in fade-in duration-150">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{pasteNotice}</span>
          </div>
        )}

        {/* Live Detection Banner */}
        {detectedCardsCount > 0 && (
          <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                {jsonDecks && jsonDecks.length > 1
                  ? `📦 Detected ${jsonDecks.length} Decks (${detectedCardsCount} Total Cards)`
                  : `✨ Detected ${detectedCardsCount} Card(s) Ready to Import`}
              </span>
            </div>
            {firstCardPreview && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-300 space-y-1">
                <div className="font-semibold text-indigo-300">
                  Card 1 Front:{" "}
                  <span className="text-slate-100 font-normal">{firstCardPreview.text}</span>
                </div>
                {firstCardPreview.note && (
                  <div className="text-slate-400">
                    Card 1 Back:{" "}
                    <span className="text-slate-300 font-normal">{firstCardPreview.note}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Deck Title */}
        {(!jsonDecks || jsonDecks.length <= 1) && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Deck Title {jsonDecks ? "(Optional)" : ""}
            </label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="e.g., Biology Chapter 1 Notes [Break]"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {/* Destination Folder */}
        {folders.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Destination Folder (Optional)
            </label>
            <select
              value={selectedFolderId || ""}
              onChange={(e) => setSelectedFolderId(e.target.value || undefined)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">📁 No Folder (Uncategorized)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Deck Purpose / Type Selector */}
        {(!jsonDecks || jsonDecks.length <= 1) && (
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
        )}

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
            Or Paste Raw Text / JSON / Q&A / Notes below:
          </label>
          {rawText.trim() && !jsonDecks && (
            <TextTranslateQuickBar
              text={rawText}
              onTextChange={(newText) => handleTextChange(newText)}
              deckName={deckName}
              className="mb-2 bg-slate-800/80 border-slate-700 text-slate-200"
            />
          )}
          <textarea
            rows={5}
            value={rawText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Paste exported deck JSON, Q&A list, TSV, or raw notes here..."
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
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 rounded-xl flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            {jsonDecks && jsonDecks.length > 1
              ? `Import All (${jsonDecks.length} Decks)`
              : "Import Deck"}
          </Button>
        </div>
      </div>
    </div>
  );
};
