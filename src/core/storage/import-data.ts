import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

import savedDataExportSchema from "../../../docs/schemas/saved-data-export-v2.schema.json";

import type { ISODateString } from "@/core/domain";

import type { SavedDataExport } from "./export-data";

export type SavedDataImportErrorCode =
  "invalid-json" | "unsupported-version" | "invalid-schema" | "duplicate-id" | "invalid-reference";

export class SavedDataImportError extends Error {
  readonly code: SavedDataImportErrorCode;

  constructor(code: SavedDataImportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SavedDataImportError";
    this.code = code;
  }
}

export interface SavedDataCounts {
  savedLaws: number;
  bookmarks: number;
  collections: number;
  annotations: number;
  studyCards: number;
  reviewLogs: number;
  studySessions: number;
}

export interface SavedDataImportPreview {
  version: 2;
  exportedAt: ISODateString;
  counts: SavedDataCounts;
}

export interface PreparedSavedDataImport {
  data: SavedDataExport;
  preview: SavedDataImportPreview;
}

export interface SavedDataImportResult {
  importedAt: ISODateString;
  counts: SavedDataCounts;
}

interface SavedDataSchemaErrorDetail {
  readonly keyword: string;
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly message?: string;
}

const ajv = new Ajv2020({ allErrors: false, strict: true });
const validateSavedDataExport = ajv.compile<SavedDataExport>(savedDataExportSchema);

export const countSavedData = (data: SavedDataExport): SavedDataCounts => ({
  savedLaws: data.savedLaws.length,
  bookmarks: data.bookmarks.length,
  collections: data.collections.length,
  annotations: data.annotations.length,
  studyCards: data.studyCards.length,
  reviewLogs: data.reviewLogs.length,
  studySessions: data.studySessions.length,
});

export const parseSavedDataImport = (input: string): PreparedSavedDataImport => {
  const parsed = parseJson(input);

  if (hasUnsupportedVersion(parsed)) {
    throw new SavedDataImportError(
      "unsupported-version",
      "Only saved data version 2 is supported.",
    );
  }

  if (!validateSavedDataExport(parsed)) {
    const schemaError = validateSavedDataExport.errors?.[0];
    const instancePath = schemaError?.instancePath === "" ? "/" : schemaError?.instancePath;
    const message = formatSchemaErrorMessage(schemaError);

    throw new SavedDataImportError(
      "invalid-schema",
      `保存データがスキーマに適合しません（${instancePath ?? "/"}: ${message}）。`,
      schemaError === undefined ? undefined : { cause: copySchemaError(schemaError) },
    );
  }

  validateUniqueIds(parsed);
  validateReferences(parsed);

  return {
    data: parsed,
    preview: {
      version: 2,
      exportedAt: parsed.exportedAt,
      counts: countSavedData(parsed),
    },
  };
};

const formatSchemaErrorMessage = (error: ErrorObject | undefined): string => {
  const message = error?.message ?? "不明なスキーマ違反です";

  if (error?.keyword !== "additionalProperties") {
    return message;
  }

  const additionalProperty = (error.params as Record<string, unknown>).additionalProperty;

  return typeof additionalProperty === "string"
    ? `${message}（未知のフィールド「${additionalProperty}」）`
    : message;
};

const copySchemaError = (error: ErrorObject): SavedDataSchemaErrorDetail => {
  // validator の次回実行から独立させ、発生時点の原因追跡情報を Error に残す。
  const params = structuredClone(error.params as unknown) as Record<string, unknown>;

  return Object.freeze({
    keyword: error.keyword,
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    params: Object.freeze(params),
    message: error.message,
  });
};

const parseJson = (input: string): unknown => {
  try {
    return JSON.parse(input) as unknown;
  } catch (cause) {
    throw new SavedDataImportError("invalid-json", "Failed to parse saved data as JSON.", {
      cause,
    });
  }
};

const hasUnsupportedVersion = (data: unknown): boolean => {
  return (
    typeof data === "object" &&
    data !== null &&
    Object.hasOwn(data, "version") &&
    (data as { version?: unknown }).version !== 2
  );
};

const validateUniqueIds = (data: SavedDataExport): void => {
  assertUnique(
    data.savedLaws.map((savedLaw) => savedLaw.law.lawId),
    "saved law lawId",
  );
  assertUnique(
    data.savedLaws.map((savedLaw) => savedLaw.revision.revisionId),
    "saved law revisionId",
  );
  assertUnique(
    data.savedLaws.flatMap((savedLaw) => savedLaw.nodes.map((node) => node.id)),
    "saved law node id",
  );
  assertUnique(
    data.bookmarks.map((bookmark) => bookmark.id),
    "bookmark id",
  );
  assertUnique(
    data.collections.map((collection) => collection.id),
    "collection id",
  );
  assertUnique(
    data.annotations.map((annotation) => annotation.id),
    "annotation id",
  );
  assertUnique(
    data.studyCards.map((card) => card.id),
    "study card id",
  );
  assertUnique(
    data.reviewLogs.map((reviewLog) => reviewLog.id),
    "review log id",
  );
  assertUnique(
    data.studySessions.map((session) => session.id),
    "study session id",
  );
};

const assertUnique = (ids: string[], label: string): void => {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      throw new SavedDataImportError("duplicate-id", `Duplicate ${label} "${id}" in saved data.`);
    }

    seen.add(id);
  }
};

const validateReferences = (data: SavedDataExport): void => {
  const studyCardIds = new Set(data.studyCards.map((card) => card.id));

  for (const reviewLog of data.reviewLogs) {
    if (!studyCardIds.has(reviewLog.cardId)) {
      throw new SavedDataImportError(
        "invalid-reference",
        `Review log "${reviewLog.id}" references missing study card "${reviewLog.cardId}".`,
      );
    }
  }

  for (const savedLaw of data.savedLaws) {
    const lawId = savedLaw.law.lawId;
    const revisionId = savedLaw.revision.revisionId;

    if (savedLaw.revision.lawId !== lawId) {
      throw new SavedDataImportError(
        "invalid-reference",
        `Saved law "${lawId}" does not match its revision lawId.`,
      );
    }

    for (const node of savedLaw.nodes) {
      if (node.lawId !== lawId) {
        throw new SavedDataImportError(
          "invalid-reference",
          `Saved law node "${node.id}" does not match its parent lawId.`,
        );
      }

      if (node.revisionId !== revisionId) {
        throw new SavedDataImportError(
          "invalid-reference",
          `Saved law node "${node.id}" does not match its parent revisionId.`,
        );
      }
    }
  }
};
