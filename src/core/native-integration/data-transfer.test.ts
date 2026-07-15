import { describe, expect, it, vi } from "vitest";

import { SavedDataImportError, type StorageRepository } from "@/core/storage";
import { createSavedDataExportFixture } from "@/test/fixtures/saved-data";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { applySavedDataImport, createSavedDataFile, prepareSavedDataImportFile } from ".";

const allDataCounts = {
  savedLaws: 1,
  bookmarks: 1,
  collections: 1,
  annotations: 1,
  studyCards: 1,
  reviewLogs: 1,
  studySessions: 1,
};

const getImportError = (contents: string): SavedDataImportError => {
  try {
    prepareSavedDataImportFile(contents);
  } catch (error) {
    expect(error).toBeInstanceOf(SavedDataImportError);
    return error as SavedDataImportError;
  }

  throw new Error("prepareSavedDataImportFile should have thrown");
};

describe("createSavedDataFile", () => {
  it("creates a dated JSON file containing every saved-data category", async () => {
    const fixture = createSavedDataExportFixture();
    const repository = createMemoryStorageRepository({
      annotations: fixture.annotations,
      bookmarks: fixture.bookmarks,
      collections: fixture.collections,
      reviewLogs: fixture.reviewLogs,
      savedLawDocument: fixture.savedLaws[0],
      studyCards: fixture.studyCards,
      studySessions: fixture.studySessions,
    }).repository;
    const exportedAt = new Date("2026-07-15T12:34:56.000Z");
    const expectedExport = {
      ...fixture,
      exportedAt: "2026-07-15T12:34:56.000Z",
    };

    const file = await createSavedDataFile(repository, exportedAt);

    expect(file).toMatchObject({
      fileName: "surasura-roppou-export-2026-07-15.json",
      mediaType: "application/json",
    });
    expect(JSON.parse(file.contents) as unknown).toEqual(expectedExport);
  });
});

describe("prepareSavedDataImportFile", () => {
  it("preserves invalid JSON as a distinct import error with the parse failure", () => {
    const invalidJsonError = getImportError("{");
    const schemaError = getImportError("{}");

    expect(invalidJsonError.code).toBe("invalid-json");
    expect(invalidJsonError.cause).toBeInstanceOf(SyntaxError);
    expect(schemaError.code).toBe("invalid-schema");
  });

  it("prepares valid version 2 data with counts for every category", () => {
    const data = createSavedDataExportFixture();

    const prepared = prepareSavedDataImportFile(JSON.stringify(data));

    expect(prepared).toEqual({
      data,
      preview: {
        version: 2,
        exportedAt: data.exportedAt,
        counts: allDataCounts,
      },
    });
  });
});

describe("applySavedDataImport", () => {
  it("passes only prepared data to the repository and returns its result", async () => {
    const prepared = prepareSavedDataImportFile(JSON.stringify(createSavedDataExportFixture()));
    const result = {
      importedAt: "2026-07-15T12:35:00.000Z",
      counts: allDataCounts,
    } as const;
    const importSavedData = vi.fn<StorageRepository["importSavedData"]>(() =>
      Promise.resolve(result),
    );
    const repository = {
      ...createMemoryStorageRepository().repository,
      importSavedData,
    };

    await expect(applySavedDataImport(repository, prepared)).resolves.toBe(result);
    expect(importSavedData).toHaveBeenCalledExactlyOnceWith(prepared.data);
  });
});
