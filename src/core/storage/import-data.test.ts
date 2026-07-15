import { describe, expect, it } from "vitest";

import { SavedDataImportError, countSavedData, parseSavedDataImport } from "@/core/storage";
import { createSavedDataExportFixture } from "@/test/fixtures/saved-data";

import type { SavedDataExport } from "./export-data";

const stringify = (data: unknown): string => JSON.stringify(data);

const getImportError = (input: string): SavedDataImportError => {
  try {
    parseSavedDataImport(input);
  } catch (error) {
    expect(error).toBeInstanceOf(SavedDataImportError);
    return error as SavedDataImportError;
  }

  throw new Error("parseSavedDataImport should have thrown");
};

describe("parseSavedDataImport", () => {
  it("accepts a valid version 2 export and previews every data category", () => {
    const data = createSavedDataExportFixture();

    const prepared = parseSavedDataImport(stringify(data));

    expect(prepared).toEqual({
      data,
      preview: {
        version: 2,
        exportedAt: "2026-07-15T00:00:00.000Z",
        counts: {
          savedLaws: 1,
          bookmarks: 1,
          collections: 1,
          annotations: 1,
          studyCards: 1,
          reviewLogs: 1,
          studySessions: 1,
        },
      },
    });
  });

  it("reports invalid JSON separately from schema errors", () => {
    const error = getImportError("{not-json");

    expect(error.code).toBe("invalid-json");
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it("rejects version 1 before schema validation", () => {
    const error = getImportError(stringify({ ...createSavedDataExportFixture(), version: 1 }));

    expect(error.code).toBe("unsupported-version");
  });

  it("treats a missing version as a schema error", () => {
    const data: Partial<SavedDataExport> = createSavedDataExportFixture();
    delete data.version;
    const error = getImportError(stringify(data));

    expect(error.code).toBe("invalid-schema");
  });

  it("rejects unknown top-level fields and reports the Ajv path and message", () => {
    const data = { ...createSavedDataExportFixture(), unknownField: true };

    const error = getImportError(stringify(data));

    expect(error.code).toBe("invalid-schema");
    expect(error.message).toContain("/: must NOT have additional properties");
  });

  it.each([
    {
      category: "saved law lawId",
      duplicate: (data: SavedDataExport) => {
        const original = data.savedLaws[0];
        data.savedLaws.push({
          ...structuredClone(original),
          revision: {
            ...structuredClone(original.revision),
            revisionId: `${original.revision.revisionId}-duplicate-law`,
          },
          nodes: original.nodes.map((node) => ({
            ...structuredClone(node),
            id: `${node.id}-duplicate-law`,
            revisionId: `${original.revision.revisionId}-duplicate-law`,
          })),
        });
      },
    },
    {
      category: "saved law revisionId",
      duplicate: (data: SavedDataExport) => {
        const original = data.savedLaws[0];
        const lawId = `${original.law.lawId}-duplicate-revision`;
        data.savedLaws.push({
          ...structuredClone(original),
          law: { ...structuredClone(original.law), lawId },
          revision: { ...structuredClone(original.revision), lawId },
          nodes: original.nodes.map((node) => ({
            ...structuredClone(node),
            id: `${node.id}-duplicate-revision`,
            lawId,
          })),
        });
      },
    },
    {
      category: "saved law node id",
      duplicate: (data: SavedDataExport) => {
        const original = data.savedLaws[0];
        const lawId = `${original.law.lawId}-duplicate-node`;
        const revisionId = `${original.revision.revisionId}-duplicate-node`;
        data.savedLaws.push({
          ...structuredClone(original),
          law: { ...structuredClone(original.law), lawId },
          revision: { ...structuredClone(original.revision), lawId, revisionId },
          nodes: original.nodes.map((node) => ({
            ...structuredClone(node),
            lawId,
            revisionId,
          })),
        });
      },
    },
    ...(
      [
        "bookmarks",
        "collections",
        "annotations",
        "studyCards",
        "reviewLogs",
        "studySessions",
      ] as const
    ).map((category) => ({
      category,
      duplicate: (data: SavedDataExport) => {
        const original = data[category][0];
        // 配列ごとに要素型が異なるため、ここでは各要素に共通する id 契約だけを使って複製する。
        data[category].push(structuredClone(original) as never);
      },
    })),
  ])("rejects a duplicate $category", ({ duplicate }) => {
    const data = createSavedDataExportFixture();
    duplicate(data);

    const error = getImportError(stringify(data));

    expect(error.code).toBe("duplicate-id");
  });

  it("rejects a review log whose card is absent from the imported study cards", () => {
    const data = createSavedDataExportFixture();
    const reviewLog = data.reviewLogs[0];
    reviewLog.cardId = "missing-study-card";

    const error = getImportError(stringify(data));

    expect(error.code).toBe("invalid-reference");
  });

  it.each([
    {
      relationship: "revision lawId",
      breakReference: (data: SavedDataExport) => {
        const savedLaw = data.savedLaws[0];
        savedLaw.revision.lawId = "different-law";
      },
    },
    {
      relationship: "node lawId",
      breakReference: (data: SavedDataExport) => {
        const node = data.savedLaws[0].nodes[0];
        node.lawId = "different-law";
      },
    },
    {
      relationship: "node revisionId",
      breakReference: (data: SavedDataExport) => {
        const node = data.savedLaws[0].nodes[0];
        node.revisionId = "different-revision";
      },
    },
  ])("rejects a saved law with a mismatched $relationship", ({ breakReference }) => {
    const data = createSavedDataExportFixture();
    breakReference(data);

    const error = getImportError(stringify(data));

    expect(error.code).toBe("invalid-reference");
  });

  it("preserves dangling collection, review-session, and study-session references", () => {
    const data = createSavedDataExportFixture();
    const collection = data.collections[0];
    const reviewLog = data.reviewLogs[0];
    const studySession = data.studySessions[0];
    collection.bookmarkIds = ["bookmark-from-another-export"];
    reviewLog.sessionId = "session-from-another-export";
    studySession.cardIds = ["card-from-another-export"];

    const prepared = parseSavedDataImport(stringify(data));

    expect(prepared.data.collections[0]?.bookmarkIds).toEqual(["bookmark-from-another-export"]);
    expect(prepared.data.reviewLogs[0]?.sessionId).toBe("session-from-another-export");
    expect(prepared.data.studySessions[0]?.cardIds).toEqual(["card-from-another-export"]);
  });
});

describe("countSavedData", () => {
  it("counts each exported data category", () => {
    expect(countSavedData(createSavedDataExportFixture())).toEqual({
      savedLaws: 1,
      bookmarks: 1,
      collections: 1,
      annotations: 1,
      studyCards: 1,
      reviewLogs: 1,
      studySessions: 1,
    });
  });
});
