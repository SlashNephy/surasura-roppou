import { EgovApiError, createEgovLawRepository } from "@/core/egov";
import type { LawDocument, LawRepository } from "@/core/egov";
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

      // 基準日が e-Gov の受理範囲外（2017-04-01 より前）の場合は 400 になる。
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

    // 基準日時点で施行されていない法令は e-Gov が 404（404004）を返す。基準日は既定の版を
    // 選ぶ機能であり出題範囲の絞り込みではないため、版が無いときは現行法を表示する。
    if (asOf !== undefined) {
      const fallback = await fetchCurrentLaw(repository, lawId);

      switch (fallback.status) {
        case "fetched":
          return {
            status: "ready",
            law: fallback.document.law,
            revision: fallback.document.revision,
            nodes: fallback.document.nodes,
            isPinned,
            loadedFromStorage: false,
            requestedAsOf: asOf,
            baseDateFallback: true,
            savedAt: savedDocument?.savedAt,
          };
        case "not-found":
          break;
        // 取得できなかった以上「見つからない」と断定できない。取得失敗として扱う。
        case "failed":
          return {
            status: "error",
            message: "法令を取得できませんでした。ネットワーク接続を確認してください。",
          };
      }
    }

    return { status: "error", message: "法令が見つかりません。" };
  }
};

// 基準日抜きで取得できるなら現行法として表示する。404 なら法令 ID が存在しない。
// それ以外の失敗（通信断・5xx など）はどちらとも判定できない。
type CurrentLawFetchResult =
  { status: "fetched"; document: LawDocument } | { status: "not-found" } | { status: "failed" };

const fetchCurrentLaw = async (
  repository: LawRepository,
  lawId: string,
): Promise<CurrentLawFetchResult> => {
  try {
    return { status: "fetched", document: await repository.getLaw(lawId, {}) };
  } catch (error) {
    return error instanceof EgovApiError && error.status === 404
      ? { status: "not-found" }
      : { status: "failed" };
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
