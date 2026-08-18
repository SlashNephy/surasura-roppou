import { useEffect } from "react";

const appName = "すらすら六法";

/**
 * ブラウザのタブ・履歴・ブックマークから現在地が分かるように、ページ名にアプリ名を続ける。
 * ページ名が未確定（データ取得中など）のときは中間状態を示す文言を置かず、アプリ名だけを出す。
 */
export const formatDocumentTitle = (pageTitle?: string): string => {
  const trimmedPageTitle = pageTitle?.trim() ?? "";
  if (trimmedPageTitle === "") {
    return appName;
  }

  return `${trimmedPageTitle} | ${appName}`;
};

/**
 * ページ名を document.title へ反映する。
 * SPA では次に表示されるページが必ず自分のタイトルを設定するため、アンマウント時の復元は行わない。
 */
export const useDocumentTitle = (pageTitle?: string): void => {
  useEffect(() => {
    document.title = formatDocumentTitle(pageTitle);
  }, [pageTitle]);
};
