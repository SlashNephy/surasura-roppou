import { EgovApiError, createEgovLawRepository } from "@/core/egov";
import type { LawRepository } from "@/core/egov";

import { offlineDemoLawId, sampleLawViewerDocument } from "./law-viewer-sample";
import type { LawViewerState } from "./law-viewer-page";

const defaultLawViewerRepository = createEgovLawRepository();

export const loadLawViewerDocument = async (
  lawId: string,
  repository: LawRepository = defaultLawViewerRepository,
): Promise<LawViewerState> => {
  if (lawId === offlineDemoLawId) {
    return { status: "offline-unavailable", lawTitle: sampleLawViewerDocument.law.title };
  }

  try {
    const document = await repository.getLaw(lawId);

    return {
      status: "ready",
      law: document.law,
      revision: document.revision,
      nodes: document.nodes,
      isSaved: false,
    };
  } catch (error) {
    if (!(error instanceof EgovApiError) || error.status !== 404) {
      return {
        status: "error",
        message: "法令を取得できませんでした。ネットワーク接続を確認してください。",
      };
    }

    return { status: "error", message: "法令が見つかりません。" };
  }
};
