import type { LawDocumentInput, SavedLawDocument, SavedLawSummary } from "./repository";
import type { StorageRepository } from "./repository";

export interface SavedLawUseCase {
  save(document: LawDocumentInput): Promise<void>;
  get(lawId: string): Promise<SavedLawDocument | undefined>;
  list(): Promise<SavedLawSummary[]>;
  remove(lawId: string): Promise<void>;
}

export const createSavedLawUseCase = (repository: StorageRepository): SavedLawUseCase => ({
  save(document) {
    return repository.saveLawDocument(document);
  },
  get(lawId) {
    return repository.getLawDocument(lawId);
  },
  list() {
    return repository.listSavedLaws();
  },
  remove(lawId) {
    return repository.deleteLawDocument(lawId);
  },
});
