import React, { useState } from "react";
import { Copy, Check, X, Layers, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  jsonText: string;
  deckCount: number;
}

export const CopyBundleModal: React.FC<CopyBundleModalProps> = ({
  isOpen,
  onClose,
  jsonText,
  deckCount,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      prompt("Copy JSON bundle:", jsonText);
    }
  };

  const handleDownloadFile = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flashcards-all-decks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-slate-100 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold flex items-center gap-2 text-indigo-300">
            <Layers className="w-5 h-5 text-indigo-400" />
            All Decks Backup & Export
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-100"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/80 text-xs text-slate-300 flex items-center justify-between gap-2">
          <span>
            📦 Contains <strong className="text-indigo-300">{deckCount} deck(s)</strong> and all folders. Ready to copy or save.
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              onClick={handleDownloadFile}
              variant="outline"
              className="h-7 text-[11px] border-slate-600 text-slate-200 hover:bg-slate-700 px-2.5"
            >
              <Download className="w-3 h-3 mr-1" />
              Save File
            </Button>
            <Button
              size="sm"
              onClick={handleCopy}
              className="h-7 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1 text-emerald-300" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Raw Decks JSON Data
          </label>
          <textarea
            readOnly
            rows={8}
            value={jsonText}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full bg-slate-950 border border-slate-800 text-indigo-200 rounded-xl p-3 text-[11px] font-mono resize-none focus:outline-none"
          />
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <Button size="sm" onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
