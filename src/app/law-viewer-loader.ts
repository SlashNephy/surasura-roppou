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
  asOf?: string,
): Promise<LawViewerState> => {
  if (lawId.trim() === "") {
    return { status: "error", message: "法令が見つかりません。" };
  }

  if (lawId === offlineDemoLawId) {
    return { status: "offline-unavailable", lawTitle: sampleLawViewerDocument.law.title };
  }

  const [savedDocument, isPinned] = await Promise.all([
    getSavedDocument(storageRepository, lawId),
    getIsLawPinned(storageRepository, lawId),
  ]);

  try {
    const document = await repository.getLaw(lawId, asOf === undefined ? {} : { asOf });

    return {
      status: "ready",
      law: document.law,
      revision: document.revision,
      nodes: document.nodes,
      isPinned,
      loadedFromStorage: false,
      requestedAsOf: asOf,
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
          isPinned,
          loadedFromStorage: true,
          requestedAsOf: asOf,
          savedAt: savedDocument.savedAt,
        };
      }

      // 基準日を指定していて版が無い場合（e-Gov は 400 を返す）は、原因が分かる文言にする。
      if (asOf !== undefined && error instanceof EgovApiError && error.status === 400) {
        return {
          status: "error",
          message: "指定した基準日にはこの法令の版が見つかりません。基準日を変更してください。",
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

// 保存領域の失敗で閲覧を止めない。ピン留めの状態が読めないときは未ピン留めとして表示する。
const getIsLawPinned = async (storageRepository: StorageRepository, lawId: string) => {
  try {
    return await storageRepository.isLawPinned(lawId);
  } catch {
    return false;
  }
};
