import {
  createSavedDataExport,
  parseSavedDataImport,
  type PreparedSavedDataImport,
  type SavedDataImportResult,
  type StorageRepository,
} from "@/core/storage";

export interface SavedDataFile {
  contents: string;
  fileName: string;
  mediaType: "application/json";
}

export const createSavedDataFile = async (
  repository: StorageRepository,
  exportedAt: Date,
): Promise<SavedDataFile> => {
  const timestamp = exportedAt.toISOString();
  const data = await createSavedDataExport(repository, timestamp);

  return {
    contents: JSON.stringify(data, null, 2),
    fileName: `surasura-roppou-export-${timestamp.slice(0, 10)}.json`,
    mediaType: "application/json",
  };
};

export const prepareSavedDataImportFile = (contents: string): PreparedSavedDataImport =>
  parseSavedDataImport(contents);

export const applySavedDataImport = (
  repository: StorageRepository,
  prepared: PreparedSavedDataImport,
): Promise<SavedDataImportResult> => repository.importSavedData(prepared.data);
