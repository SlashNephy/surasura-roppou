// localStorage のキー。名前空間を付けて他アプリと衝突しないようにする。
const storageKey = "surasura:ocr-model-consent";

// 日本語モデルのダウンロード同意フラグ。一度 granted なら以降ダイアログを出さない。
export const getOcrModelConsent = (): boolean => {
  if (typeof localStorage === "undefined") {
    return false;
  }
  return localStorage.getItem(storageKey) === "granted";
};

export const setOcrModelConsent = (granted: boolean): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (granted) {
    localStorage.setItem(storageKey, "granted");
  } else {
    localStorage.removeItem(storageKey);
  }
};
