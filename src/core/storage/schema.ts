import type { DBSchema } from "idb";

import type {
  Annotation,
  Bookmark,
  CardSchedule,
  Collection,
  ISODateString,
  Law,
  LawNode,
  LawRevision,
  OcrSession,
  ReviewLog,
  StudyCard,
  StudySession,
} from "@/core/domain";

export const surasuraDatabaseName = "surasura-roppou";
export const surasuraDatabaseVersion = 3;

export interface SavedLawRecord {
  lawId: string;
  revisionId: string;
  nodeCount: number;
  savedAt: ISODateString;
  updatedAt: ISODateString;
}

export interface StoredLawNode {
  id: string;
  lawId: string;
  revisionId: string;
  sortOrder: number;
  node: LawNode;
}

export interface TargetIndexes {
  lawId: string;
  targetKey: string;
}

// version 2: オンライン取得した法令メタデータのキャッシュ（名前・番号・略称検索の対象）
export interface LawCatalogEntry {
  lawId: string;
  title: string;
  lawNumber?: string;
  lawType?: string;
  aliases: string[];
  cachedAt: ISODateString;
}

// version 2: 保存済み本文の Bigram 転置インデックス。法令ごとに独立キーで持つ。
export interface SearchPosting {
  lawId: string;
  bigram: string;
  nodeIds: string[];
}

export interface SurasuraDatabase extends DBSchema {
  laws: {
    key: string;
    value: Law;
    indexes: {
      "by-title": string;
      "by-updated-at": string;
    };
  };
  lawRevisions: {
    key: string;
    value: LawRevision;
    indexes: {
      "by-law-id": string;
      "by-effective-date": string;
    };
  };
  lawNodes: {
    key: string;
    value: StoredLawNode;
    indexes: {
      "by-law-revision": [string, string];
    };
  };
  savedLaws: {
    key: string;
    value: SavedLawRecord;
    indexes: {
      "by-saved-at": string;
      "by-updated-at": string;
    };
  };
  bookmarks: {
    key: string;
    value: Bookmark & TargetIndexes;
    indexes: {
      "by-law-id": string;
      "by-target-key": string;
      "by-updated-at": string;
    };
  };
  collections: {
    key: string;
    value: Collection;
    indexes: {
      "by-updated-at": string;
    };
  };
  annotations: {
    key: string;
    value: Annotation & TargetIndexes;
    indexes: {
      "by-law-id": string;
      "by-target-key": string;
      "by-updated-at": string;
    };
  };
  studyCards: {
    key: string;
    value: StudyCard & TargetIndexes;
    indexes: {
      "by-law-id": string;
      "by-target-key": string;
      "by-updated-at": string;
    };
  };
  reviewLogs: {
    key: string;
    value: ReviewLog;
    indexes: {
      "by-card-id": string;
      "by-reviewed-at": string;
    };
  };
  cardSchedules: {
    key: string;
    value: CardSchedule;
    indexes: {
      "by-due-at": string;
    };
  };
  studySessions: {
    key: string;
    value: StudySession;
    indexes: {
      "by-started-at": string;
    };
  };
  ocrSessions: {
    key: string;
    value: OcrSession;
    indexes: {
      "by-created-at": string;
      "by-updated-at": string;
    };
  };
  lawCatalog: {
    key: string;
    value: LawCatalogEntry;
    indexes: {
      "by-title": string;
      "by-cached-at": string;
    };
  };
  searchPostings: {
    key: [string, string];
    value: SearchPosting;
    indexes: {
      "by-bigram": string;
      "by-law-id": string;
    };
  };
}
