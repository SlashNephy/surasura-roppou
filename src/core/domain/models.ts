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

export interface LawNode {
  id: string;
  lawId: string;
  revisionId: string;
  type: LawNodeType;
  path: string;
  number?: string;
  title?: string;
  caption?: string;
  rawText: string;
  plainText: string;
  normalizedText?: string;
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

export interface Annotation {
  id: string;
  target: LawReferenceTarget;
  targetText?: string;
  prefixText?: string;
  suffixText?: string;
  note: string;
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
