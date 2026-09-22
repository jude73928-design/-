import React, { useState, useEffect } from "react";
import { Folder, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Folder as FolderType } from "@/lib/flashcards";

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
  folderToEdit?: FolderType | null;
}

const COLOR_OPTIONS = [
  { id: "indigo", bg: "bg-indigo-600", border: "border-indigo-400", ring: "ring-indigo-500" },
  { id: "emerald", bg: "bg-emerald-600", border: "border-emerald-400", ring: "ring-emerald-500" },
  { id: "amber", bg: "bg-amber-600", border: "border-amber-400", ring: "ring-amber-500" },
  { id: "rose", bg: "bg-rose-600", border: "border-rose-400", ring: "ring-rose-500" },
  { id: "cyan", bg: "bg-cyan-600", border: "border-cyan-400", ring: "ring-cyan-500" },
  { id: "violet", bg: "bg-violet-600", border: "border-violet-400", ring: "ring-violet-500" },
];

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  folderToEdit,
}) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState("indigo");

  useEffect(() => {
    if (folderToEdit) {
      setName(folderToEdit.name);
      setColor(folderToEdit.color || "indigo");
    } else {
      setName("");
      setColor("indigo");
    }
  }, [folderToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), color);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4 text-slate-100 shadow-2xl relative">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Folder className="w-4 h-4 text-indigo-400" />
            {folderToEdit ? "Edit Folder" : "Create New Folder"}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-100"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Folder Name
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., History, Japanese, Biology..."
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              dir="auto"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Folder Badge Color
            </label>
            <div className="flex items-center gap-2.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={`w-7 h-7 rounded-full ${c.bg} flex items-center justify-center transition-transform ${
                    color === c.id ? "scale-110 ring-2 ring-white" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  {color === c.id && <Check className="w-4 h-4 text-white shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs text-slate-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 rounded-xl"
            >
              {folderToEdit ? "Save Changes" : "Create Folder"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
