import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { playClick, playCorrect } from "@/lib/sounds";

export interface HoldButtonProps {
  onComplete: () => void;
  durationMs?: number;
  label?: string;
  completedLabel?: string;
  sublabel?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const HoldButton: React.FC<HoldButtonProps> = ({
  onComplete,
  durationMs = 450,
  label = "Hold to Reveal",
  completedLabel = "Revealed!",
  sublabel,
  icon,
  className,
  disabled = false,
}) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const cleanupRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const handleStartHold = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (disabled || isCompleted) return;
      // Prevent context menu or touch scrolling while holding
      if ("touches" in e) {
        // Touch interaction
      }
      playClick();
      setIsHolding(true);
      completedRef.current = false;
      startTimeRef.current = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTimeRef.current;
        const p = Math.min(1, elapsed / durationMs);
        setProgress(p);

        if (p >= 1) {
          if (!completedRef.current) {
            completedRef.current = true;
            setIsHolding(false);
            setIsCompleted(true);
            playCorrect();
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              try {
                navigator.vibrate(30);
              } catch {
                // Ignore vibration failure
              }
            }
            onComplete();
          }
        } else {
          rafRef.current = requestAnimationFrame(animate);
        }
      };

      cleanupRaf();
      rafRef.current = requestAnimationFrame(animate);
    },
    [disabled, isCompleted, durationMs, onComplete],
  );

  const handleEndHold = useCallback(() => {
    if (completedRef.current) return;
    cleanupRaf();
    setIsHolding(false);

    // Smoothly drain progress back down
    const startDrainTime = performance.now();
    const initialProgress = progress;

    const drain = (now: number) => {
      const elapsed = now - startDrainTime;
      const drainDuration = 150;
      const factor = Math.max(0, 1 - elapsed / drainDuration);
      const current = initialProgress * factor;
      setProgress(current);
      if (current > 0) {
        rafRef.current = requestAnimationFrame(drain);
      } else {
        setProgress(0);
      }
    };

    cleanupRaf();
    rafRef.current = requestAnimationFrame(drain);
  }, [progress]);

  useEffect(() => {
    return () => cleanupRaf();
  }, []);

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={handleStartHold}
      onMouseUp={handleEndHold}
      onMouseLeave={handleEndHold}
      onTouchStart={handleStartHold}
      onTouchEnd={handleEndHold}
      onTouchCancel={handleEndHold}
      className={cn(
        "relative overflow-hidden select-none touch-none",
        "flex flex-col items-center justify-center rounded-2xl border transition-all active:scale-[0.98]",
        isHolding
          ? "border-primary shadow-lg shadow-primary/20 scale-[0.99]"
          : "border-border/80 bg-card hover:border-primary/50",
        isCompleted
          ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400"
          : "text-foreground",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      style={{ WebkitUserSelect: "none" }}
    >
      {/* Dynamic Progress Fill Bar */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 bg-primary/25 transition-none pointer-events-none",
          isCompleted && "bg-emerald-500/30",
        )}
        style={{
          width: `${Math.round(progress * 100)}%`,
        }}
      />

      {/* Button Content */}
      <div className="relative z-10 flex items-center gap-2 px-4 py-3 font-semibold text-sm">
        {icon}
        <span>{isCompleted ? completedLabel : label}</span>
      </div>

      {sublabel && (
        <span className="relative z-10 text-[11px] text-muted-foreground -mt-1 pb-2">
          {sublabel}
        </span>
      )}
    </button>
  );
};
