import React, { useState } from "react";
import { TagState, TAG_CYCLE, TAG_LABEL, TAG_TITLE } from "@/lib/tagChip";

export type { TagState };

export interface TagChipProps {
  initialState?: TagState;
  state?: TagState;
  onChange?: (nextState: TagState) => void;
  className?: string;
}

export function TagChip({
  initialState = "note",
  state: controlledState,
  onChange,
  className = "",
}: TagChipProps) {
  const [internalState, setInternalState] = useState<TagState>(initialState);
  const currentState = controlledState !== undefined ? controlledState : internalState;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const nextIdx = (TAG_CYCLE.indexOf(currentState) + 1) % TAG_CYCLE.length;
    const nextState = TAG_CYCLE[nextIdx];
    if (controlledState === undefined) {
      setInternalState(nextState);
    }
    onChange?.(nextState);
  };

  return (
    <button
      type="button"
      className={`tag ${currentState} ${className}`.trim()}
      title={TAG_TITLE[currentState]}
      onClick={handleClick}
      aria-label={TAG_TITLE[currentState]}
    >
      {TAG_LABEL[currentState]}
    </button>
  );
}
