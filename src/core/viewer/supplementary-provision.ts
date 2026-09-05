import type { LawNode } from "@/core/domain";

// e-Gov の附則見出しはどれも「附則」で、制定時の附則か改正附則かを見分けられない。
// e-Gov の表示と同じく、改正法令番号と抄を見出しの後ろに添えて区別する。
// 法令番号は漢数字が正式表記であるため、見やすい表示でも原文のまま添える。
export const supplementaryProvisionHeadingSuffix = ({
  amendLawNumber,
  isExtract,
}: Pick<LawNode, "amendLawNumber" | "isExtract">): string | undefined => {
  const lawNumberText = amendLawNumber === undefined ? undefined : `（${amendLawNumber}）`;
  const extractText = isExtract === true ? "抄" : undefined;

  if (lawNumberText === undefined) {
    return extractText;
  }

  return extractText === undefined ? lawNumberText : `${lawNumberText}\u3000${extractText}`;
};
