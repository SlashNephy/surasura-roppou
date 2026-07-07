export const parseTags = (value: string): string[] =>
  value
    .split(/[,，、]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
