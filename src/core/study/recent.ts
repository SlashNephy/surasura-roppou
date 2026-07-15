import { buildArticleReferenceKey } from "@/core/domain";
import type { ISODateString, StudyCard } from "@/core/domain";

export type RecentItem =
  | { kind: "law"; lawId: string; title: string; at: ISODateString }
  | { kind: "card"; card: StudyCard; at: ISODateString };

export interface RecentInputs {
  savedLaws: readonly { lawId: string; title: string; at: ISODateString }[];
  reviewedCards: readonly { card: StudyCard; at: ISODateString }[];
}

interface MergeRecentItemsOptions {
  limit?: number;
}

// 重複除去キー。法令は法令単位、カードは対象条文単位で正規化する。
const itemKey = (item: RecentItem): string =>
  item.kind === "law"
    ? buildArticleReferenceKey({ lawId: item.lawId })
    : buildArticleReferenceKey(item.card.target);

export const mergeRecentItems = (
  inputs: RecentInputs,
  options: MergeRecentItemsOptions = {},
): RecentItem[] => {
  const limit = options.limit ?? 5;

  const items: RecentItem[] = [
    ...inputs.savedLaws.map((law): RecentItem => ({
      kind: "law",
      lawId: law.lawId,
      title: law.title,
      at: law.at,
    })),
    ...inputs.reviewedCards.map((entry): RecentItem => ({
      kind: "card",
      card: entry.card,
      at: entry.at,
    })),
  ];

  // ISO 8601 文字列は辞書順比較が時系列順と一致するので、そのまま降順に並べる。
  items.sort((left, right) => right.at.localeCompare(left.at));

  const seen = new Set<string>();
  const merged: RecentItem[] = [];
  for (const item of items) {
    const key = itemKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, limit);
};
