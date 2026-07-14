// 行政書士試験の出題科目と対象法令の対応（設計 2026-07-14 の 3 章）。
// lawId は e-Gov /api/2/laws の実レスポンスで検証済みの値（alias-dictionary と同じ出典）を
// 文字列リテラルで持つ。core/study は core/domain のみに依存する層構造を保つため、
// core/jump（alias-dictionary）へは依存しない。
// 基礎法学は特定の法令に紐づかない科目のため、ここには含めない（カードのタグ運用に委ねる）。

export type SubjectId = "constitution" | "civil" | "administrative" | "commercial";

export interface Subject {
  id: SubjectId;
  // 画面表示用の科目名。
  label: string;
  // 科目に属する法令の e-Gov lawId。
  lawIds: readonly string[];
}

export const gyoseishoshiSubjects: readonly Subject[] = [
  {
    id: "constitution",
    label: "憲法",
    lawIds: ["321CONSTITUTION"], // 日本国憲法
  },
  {
    id: "civil",
    label: "民法",
    lawIds: ["129AC0000000089"], // 民法
  },
  {
    id: "administrative",
    label: "行政法",
    lawIds: [
      "405AC0000000088", // 行政手続法
      "426AC0000000068", // 行政不服審査法
      "337AC0000000139", // 行政事件訴訟法
      "322AC0000000125", // 国家賠償法
      "322AC0000000067", // 地方自治法
    ],
  },
  {
    id: "commercial",
    label: "商法/会社法",
    lawIds: [
      "132AC0000000048", // 商法
      "417AC0000000086", // 会社法
    ],
  },
];

// URL クエリなど任意文字列から科目を解決する。不明値は undefined を返す。
export const findSubject = (id: string): Subject | undefined =>
  gyoseishoshiSubjects.find((subject) => subject.id === id);

export const isLawInSubject = (subjectId: SubjectId, lawId: string): boolean =>
  findSubject(subjectId)?.lawIds.includes(lawId) ?? false;
