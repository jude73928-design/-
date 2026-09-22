import React from "react";
import { HelpCircle, Quote, CheckCheck } from "lucide-react";
import { Card, CardType, getCardType, NEXT_TYPE_CYCLE } from "@/lib/flashcards";
import { playClick } from "@/lib/sounds";

export interface CardTypeDotProps {
  card?: Card | null;
  cardType?: CardType;
  onTypeChange?: (newType: CardType) => void;
  onDotClick?: () => void;
  editable?: boolean;
  className?: string;
  showLabel?: boolean;
}

const TYPE_CONFIG: Record<
  CardType,
  {
    label: string;
    description: string;
    dotClass: string;
    badgeClass: string;
    activeClass: string;
    icon: React.ComponentType<{ className?: string }>;
    textColor: string;
  }
> = {
  question: {
    label: "Question",
    description: "Inquiry or quiz prompt",
    dotClass: "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)] ring-2 ring-sky-400/50",
    badgeClass: "bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20",
    activeClass: "bg-sky-500/15 border-sky-500/40 text-sky-300 ring-1 ring-sky-400/40 shadow-xs",
    icon: HelpCircle,
    textColor: "text-sky-400",
  },
  quote: {
    label: "Quote",
    description: "Quotation or cited passage",
    dotClass: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] ring-2 ring-amber-400/50",
    badgeClass: "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20",
    activeClass:
      "bg-amber-500/15 border-amber-500/40 text-amber-300 ring-1 ring-amber-400/40 shadow-xs",
    icon: Quote,
    textColor: "text-amber-400",
  },
  fact: {
    label: "Note",
    description: "Study note or fact",
    dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] ring-2 ring-emerald-400/50",
    badgeClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20",
    activeClass:
      "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-400/40 shadow-xs",
    icon: CheckCheck,
    textColor: "text-emerald-400",
  },
  note: {
    label: "Note",
    description: "Study note or fact",
    dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] ring-2 ring-emerald-400/50",
    badgeClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20",
    activeClass:
      "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-400/40 shadow-xs",
    icon: CheckCheck,
    textColor: "text-emerald-400",
  },
};

export const CardTypeDot: React.FC<CardTypeDotProps> = ({
  card,
  cardType,
  onTypeChange,
  onDotClick,
  editable = true,
  className = "",
  showLabel = true,
}) => {
  const currentType = cardType || (card ? getCardType(card) : "fact");
  const config = TYPE_CONFIG[currentType] || TYPE_CONFIG.fact;
  const Icon = config.icon;

  const handleToggle = () => {
    if (!editable) return;
    playClick();
    if (onDotClick) {
      onDotClick();
    } else if (onTypeChange) {
      const next = NEXT_TYPE_CYCLE[currentType] || "question";
      onTypeChange(next);
    }
  };

  if (!editable) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium select-none ${config.badgeClass} ${className}`}
        title={`Type: ${config.label}`}
      >
        <span className={`inline-block size-2 rounded-full ${config.dotClass}`} />
        {showLabel && <span>{config.label}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all select-none cursor-pointer active:scale-90 hover:brightness-110 shadow-xs ${config.activeClass} ${className}`}
      title={`Current: ${config.label}. Tap dot to switch type (Note ➔ Question ➔ Quote)`}
      aria-label={`Card type: ${config.label}. Tap to change.`}
    >
      <span
        className={`inline-block size-2.5 rounded-full transition-transform group-hover:scale-125 ${config.dotClass}`}
      />
      {showLabel && (
        <span className="flex items-center gap-1 text-[11px]">
          <Icon className="size-3 opacity-90" />
          <span>{config.label}</span>
        </span>
      )}
    </button>
  );
};
