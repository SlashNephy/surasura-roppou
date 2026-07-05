import { transformReadableText, type ReadabilityTransformMode } from "@/shared/utils/readability";

export type LawTextDisplayMode = "original" | "readable";

export const applyLawTextDisplayMode = (
  text: string,
  displayMode: LawTextDisplayMode,
  transformMode: ReadabilityTransformMode = "all",
): string => (displayMode === "readable" ? transformReadableText(text, transformMode) : text);
