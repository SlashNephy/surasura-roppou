// e-Gov 法令API の法令種別（law_type）を日本語表記に変換する。
// 対応は e-Gov 公式ドキュメント「法令種別と法令ID」に準拠する。
// https://laws.e-gov.go.jp/docs/law-data-basic/607318a-lawtypes-and-lawid/
const lawTypeLabels: Record<string, string> = {
  Constitution: "憲法",
  Act: "法律",
  CabinetOrder: "政令",
  ImperialOrder: "勅令",
  MinisterialOrdinance: "府省令",
  Rule: "規則",
  Misc: "その他",
};

export const formatLawTypeLabel = (lawType: string | undefined): string | undefined => {
  if (lawType === undefined) {
    return undefined;
  }

  // 未知の種別は情報を落とさないよう生の値をそのまま返す。
  return lawTypeLabels[lawType] ?? lawType;
};
