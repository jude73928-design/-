export type TagState = "note" | "question" | "factcheck";

export const TAG_CYCLE: TagState[] = ["note", "question", "factcheck"];
export const TAG_LABEL: Record<TagState, string> = {
  note: "N",
  question: "Q",
  factcheck: "FC",
};
export const TAG_TITLE: Record<TagState, string> = {
  note: "regular note · ملاحظة عادية",
  question: "question · سؤال",
  factcheck: "fact-check · تحقق من الحقيقة",
};
