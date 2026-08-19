import { EgovApiError, createEgovLawRepository } from "@/core/egov";
import type { LawRepository } from "@/core/egov";
import { createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import { formatIsoDateLabel } from "@/shared/utils/dates";

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

    // 基準日時点で施行されていない法令は e-Gov が 404（404004）を返すため、法令 ID 自体が
    // 無い場合と区別が付かない。現行法として取得できるかどうかで切り分け、原因が分かる文言にする。
    if (asOf !== undefined && (await isAvailableAsCurrentLaw(repository, lawId))) {
      return {
        status: "error",
        message: `この法令は基準日 ${formatIsoDateLabel(asOf)} の時点では施行されていません。設定で基準日を変更すると表示できます。`,
      };
    }

    return { status: "error", message: "法令が見つかりません。" };
  }
};

// 基準日抜きで取得できるなら「基準日時点で未施行」、それでも 404 なら法令 ID が存在しない。
const isAvailableAsCurrentLaw = async (
  repository: LawRepository,
  lawId: string,
): Promise<boolean> => {
  try {
    await repository.getLaw(lawId, {});

    return true;
  } catch {
    return false;
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
