import type { LawReferenceTarget } from "@/core/domain";

// 「新しい条文に付け替える」: 指紋と revisionId を現在の解決先へ更新し、固定を解除する。
export const repathAnchor = (
  target: LawReferenceTarget,
  next: { revisionId: string; fingerprint: string },
): LawReferenceTarget => ({
  ...target,
  revisionId: next.revisionId,
  fingerprint: next.fingerprint,
  pinned: false,
});

// 「この版のまま固定する」: 以後 revisionId 固定で開き、バッジを常設する。
export const pinAnchor = (target: LawReferenceTarget): LawReferenceTarget => ({
  ...target,
  pinned: true,
});
