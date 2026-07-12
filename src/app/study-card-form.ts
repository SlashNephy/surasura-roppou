import type { StudyCardType } from "@/core/domain";

// design-doc 7.8 のカード種別と表示名の対応。一覧・詳細のバッジ表示でも使う。
// コンポーネントファイルから分離しているのは、コンポーネント以外の export が
// あると React Fast Refresh が効かなくなるため（react-refresh/only-export-components）。
export const studyCardTypeLabels: Record<StudyCardType, string> = {
  fill_blank: "穴埋め",
  true_false: "正誤",
  article_number: "条文番号当て",
  law_name: "法令名当て",
  definition: "定義語",
  requirements_effects: "要件・効果",
  compare: "比較",
};

// カンマ区切りのタグ入力を配列へ。日本語入力を考慮して全角読点でも区切る。
export const parseTagsInput = (input: string): string[] => [
  ...new Set(
    input
      .split(/[,、]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ""),
  ),
];
