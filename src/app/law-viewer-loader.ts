import { EgovApiError, createEgovLawRepository } from "@/core/egov";
import type { LawRepository } from "@/core/egov";
import { createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";

import { offlineDemoLawId, sampleLawViewerDocument } from "./law-viewer-sample";
import type { LawViewerState } from "./law-viewer-page";

const defaultLawViewerRepository = createEgovLawRepository();
const defaultStorageRepository = createStorageRepository();

export const loadLawViewerDocument = async (
  lawId: string,
  repository: LawRepository = defaultLawViewerRepository,
  storageRepository: StorageRepository = defaultStorageRepository,
): Promise<LawViewerState> => {
  if (lawId.trim() === "") {
    return { status: "error", message: "法令が見つかりません。" };
  }

  if (lawId === offlineDemoLawId) {
    return { status: "offline-unavailable", lawTitle: sampleLawViewerDocument.law.title };
  }

  const savedDocument = await getSavedDocument(storageRepository, lawId);

  try {
    const document = await repository.getLaw(lawId);

    return {
      status: "ready",
      law: document.law,
      revision: document.revision,
      nodes: document.nodes,
      isSaved: savedDocument !== undefined,
      loadedFromStorage: false,
      savedAt: savedDocument?.savedAt,
    };
  } catch (error) {
    if (!(error instanceof EgovApiError) || error.status !== 404) {
      if (savedDocument !== undefined) {
        return {
          status: "ready",
          law: savedDocument.law,
          revision: savedDocument.revision,
          nodes: savedDocument.nodes,
          isSaved: true,
          loadedFromStorage: true,
          savedAt: savedDocument.savedAt,
        };
      }

      return {
        status: "error",
        message: "法令を取得できませんでした。ネットワーク接続を確認してください。",
      };
    }

    return { status: "error", message: "法令が見つかりません。" };
  }
};

const getSavedDocument = async (storageRepository: StorageRepository, lawId: string) => {
  try {
    return await storageRepository.getLawDocument(lawId);
  } catch {
    return undefined;
  }
};
