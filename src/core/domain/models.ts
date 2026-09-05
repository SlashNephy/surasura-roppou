import type { ArticleReference, LawReferenceTarget } from "./references";

export type ISODateString = string;

export interface Law {
  lawId: string;
  title: string;
  lawNumber?: string;
  lawType?: string;
  aliases: string[];
  source: "egov";
  updatedAt?: ISODateString;
}

export interface LawRevision {
  lawId: string;
  revisionId: string;
  asOf?: string;
  effectiveDate?: string;
  fetchedAt: ISODateString;
  sourceUrl?: string;
}

export type LawNodeType =
  | "Part"
  | "Chapter"
  | "Section"
  | "Subsection"
  | "Division"
  | "Article"
  | "Paragraph"
  | "Item"
  | "Subitem"
  | "SupplementaryProvision"
  | "AppdxTable"
  | "AppdxStyle";

// ルビ（例: 瑕疵かし）は本文文字列から読みを除き、表示レイヤーで <ruby> として復元する。
export interface RubyAnnotation {
  base: string;
  text: string;
}

export interface LawNode {
  id: string;
  lawId: string;
  revisionId: string;
  type: LawNodeType;
  path: string;
  number?: string;
  title?: string;
  caption?: string;
  // 附則の改正法令番号（e-Gov の SupplProvision/@AmendLawNum）。制定時の附則には付かない。
  // 見出しがどれも「附則」で揃うため、いつの改正で加わった附則かはこれでしか区別できない。
  amendLawNumber?: string;
  // 附則が抄（一部抜粋）であること（e-Gov の SupplProvision/@Extract）。
  isExtract?: boolean;
  rawText: string;
  plainText: string;
  normalizedText?: string;
  rubyAnnotations?: RubyAnnotation[];
  children: string[];
  parentId?: string;
}

export interface Bookmark {
  id: string;
  target: LawReferenceTarget;
  title: string;
  note?: string;
  tags: string[];
  color?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Collection {
  id: string;
  title: string;
  description?: string;
  bookmarkIds: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type HighlightColor = "cyan" | "orange" | "pink" | "yellow";

// ポップアップに並ぶ順。輝度の高い順に並べ、両テーマで同じ順序を保つ。
export const highlightColors: readonly HighlightColor[] = ["yellow", "cyan", "pink", "orange"];

// 1つのテキスト範囲。W3C Web Annotation の TextQuoteSelector 相当。
// 位置を文字オフセットではなく引用文と前後文脈で表すので、条文が改正で伸縮しても再探索できる。
export interface TextQuoteAnchor {
  target: LawReferenceTarget;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface Annotation {
  id: string;
  target: LawReferenceTarget;
  // 1回のユーザー選択の断片。v1 は必ず長さ 1。複数ノードにまたがる選択で伸びる。
  anchors: TextQuoteAnchor[];
  // 未定義なら色なしの純粋な注釈。ハイライトとしては描画しない。
  color?: HighlightColor;
  note?: string;
  tags: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type StudyCardType =
  | "fill_blank"
  | "true_false"
  | "article_number"
  | "law_name"
  | "definition"
  | "requirements_effects"
  | "compare";

export interface StudyCard {
  id: string;
  source: "manual" | "ocr" | "bookmark" | "auto";
  target: LawReferenceTarget;
  type: StudyCardType;
  question: string;
  answer: string;
  // 多択の選択肢（条文番号当てなどの自動生成カードのみが持つ）。
  // question 文字列へ焼き込まず構造化して持ち、復習画面が選択肢ボタンを描画できるようにする。
  choices?: string[];
  explanation?: string;
  tags: string[];
  // 「試験直前に確認」の手動ピン。復習状態のラベルとは独立したユーザー意思。
  examPinned: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type QuizRating = "again" | "hard" | "good" | "easy";

// 追記専用の回答ログ。学習データの真実の源であり、スケジュール状態はここから再計算できる。
export interface ReviewLog {
  id: string;
  cardId: string;
  // 復習セッションへの紐付け（任意）。
  sessionId?: string;
  grade: QuizRating;
  reviewedAt: ISODateString;
  durationMs?: number;
  // 出題間隔の算定方式。例: "fixed-interval@1"。算定方式の混在を後から検出できるようにする。
  scheduler: string;
}

// ReviewLog からの導出キャッシュ。破損時はログの再計算で復元する。
export interface CardSchedule {
  cardId: string;
  dueAt: ISODateString;
  intervalDays: number;
  // again で落ちた回数。
  lapses: number;
  reviews: number;
  // 直近 8 回の回答に占める again の割合。
  recentMistakeRate: number;
  // 反映済みの最後の ReviewLog id（整合性チェック用）。
  derivedFrom: string;
}

export interface StudySession {
  id: string;
  startedAt: ISODateString;
  finishedAt?: ISODateString;
  cardIds: string[];
}

export interface OcrSession {
  id: string;
  sourceText?: string;
  detectedReferences: DetectedLawReference[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DetectedLawReference {
  id: string;
  rawText: string;
  normalizedText: string;
  lawNameCandidate?: string;
  lawAlias?: string;
  article?: string;
  paragraph?: string;
  item?: string;
  confidence: number;
  source: LawReferenceDetectionSource;
  candidates: LawReferenceCandidate[];
}

export interface LawReferenceDetectionSource {
  type: "manual" | "ocr" | "clipboard";
  imageId?: string;
  boundingBox?: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LawReferenceCandidate extends Partial<ArticleReference> {
  lawId: string;
  lawTitle: string;
  score: number;
  reason: string[];
}
