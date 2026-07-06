import type { DBSchema } from "idb";

import type {
  Annotation,
  Bookmark,
  Collection,
  ISODateString,
  Law,
  LawNode,
  LawRevision,
  OcrSession,
  StudyCard,
  StudySession,
} from "@/core/domain";

export const surasuraDatabaseName = "surasura-roppou";
export const surasuraDatabaseVersion = 1;

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
      "by-due-at": string;
      "by-law-id": string;
      "by-target-key": string;
      "by-updated-at": string;
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
}
