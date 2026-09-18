import React, { useState, useEffect } from "react";
import { Coffee, Lock, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BreakRestrictedProps {
  children?: React.ReactNode;
  title?: string;
  description?: string;
}

export const BreakRestrictedComponent: React.FC<BreakRestrictedProps> = ({
  children,
  title = "Break Activity Zone",
  description = "This feature is unlocked exclusively during active break sessions.",
}) => {
  const [isBreakActive, setIsBreakActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Sync initial state on client mount
    setIsBreakActive(localStorage.getItem("pomodoro_is_break") === "true");

    const handlePomodoroChange = () => {
      setIsBreakActive(localStorage.getItem("pomodoro_is_break") === "true");
    };

    window.addEventListener("pomodoroStateChange", handlePomodoroChange);
    window.addEventListener("storage", handlePomodoroChange);

    return () => {
      window.removeEventListener("pomodoroStateChange", handlePomodoroChange);
      window.removeEventListener("storage", handlePomodoroChange);
    };
  }, []);

  if (!isBreakActive) {
    return (
      <div className="p-5 bg-slate-900/80 border border-slate-800 text-slate-300 rounded-xl shadow-inner relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-slate-800 text-slate-400 rounded-lg shrink-0 border border-slate-700">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              🔒 {title}
            </h4>
            <p className="text-xs text-slate-400 mt-1">{description}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700/60 inline-flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-emerald-400" />
                Start a break in the Pomodoro widget to unlock!
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-100 rounded-xl shadow-lg relative overflow-hidden">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Break Mode Unlocked
            </h4>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-500/30">
          ACTIVE BREAK
        </span>
      </div>

      {children ? (
        children
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-emerald-200/90 leading-relaxed">
            🎉 You have full access to break features! Relax your mind with light flashcard games,
            casual notes, or stretch breaks.
          </p>
        </div>
      )}
    </div>
  );
};
