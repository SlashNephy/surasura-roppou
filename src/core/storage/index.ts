export {
  createStorageRepository,
  deleteSurasuraDatabase,
  openSurasuraDatabase,
  surasuraDatabaseName,
  surasuraDatabaseVersion,
} from "./repository";
export type {
  LawDocumentInput,
  LawScopedQuery,
  SavedLawDocument,
  SavedLawSummary,
  StorageRepository,
  StorageRepositoryOptions,
} from "./repository";
export type { SavedLawRecord, SurasuraDatabase } from "./schema";
