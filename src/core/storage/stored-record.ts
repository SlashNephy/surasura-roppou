import { buildArticleReferenceKey } from "@/core/domain";
import type { LawReferenceTarget } from "@/core/domain";

import type { TargetIndexes } from "./schema";

export const withTargetIndexes = <T extends { id: string; target: LawReferenceTarget }>(
  record: T,
): T & TargetIndexes => ({
  ...record,
  lawId: record.target.lawId,
  targetKey: buildArticleReferenceKey(record.target),
});

export const stripTargetIndexes = <T extends { id: string }>(record: T & TargetIndexes): T => {
  const { lawId, targetKey, ...publicRecord } = record;
  void lawId;
  void targetKey;
  return publicRecord as unknown as T;
};
