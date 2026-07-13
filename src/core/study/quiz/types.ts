import type { LawNode, StudyCardType } from "@/core/domain";

// 保存前の一時オブジェクト。ID・指紋・タイムスタンプを持たず、
// ユーザーが採用した時点で初めて StudyCard へ変換する。破棄は「保存しない」ことで実現する。
export interface QuizCandidate {
  type: StudyCardType;
  // 生成ルールのバージョン識別子。例: "fill-blank@1"。
  // スケジューラの "fixed-interval@1" と同じ流儀で、生成方式の混在を後から検出できるようにする。
  ruleId: string;
  question: string;
  answer: string;
  // 多択の選択肢。条文番号当て（article_number）のみが持つ。
  choices?: string[];
  // 生成元 Article ノードの id。
  sourceNodeId: string;
}

export interface GenerationContext {
  lawTitle: string;
  // 同一法令の全ノード。項テキストの解決と近傍条文の選択に使う。
  nodes: readonly LawNode[];
}
