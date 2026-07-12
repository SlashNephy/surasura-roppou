// localStorage のキー。名前空間を付けて他アプリと衝突しないようにする。
const storageKey = "surasura:ocr-model-consent";

// 日本語モデルのダウンロード同意フラグ。一度 granted なら以降ダイアログを出さない。
export const getOcrModelConsent = (): boolean => {
  if (typeof localStorage === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(storageKey) === "granted";
  } catch {
    // プライベートブラウジング等でストレージアクセスが blocked されると
    // getter 呼び出し自体が SecurityError を投げる環境がある。
    // その場合は未同意として扱い、ダイアログを毎回表示する。
    return false;
  }
};

export const setOcrModelConsent = (granted: boolean): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    if (granted) {
      localStorage.setItem(storageKey, "granted");
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // ストレージ不可の環境では同意を永続化できず毎回確認する動作に劣化させる
    // （クラッシュより良い）。Safari プライベートモードの QuotaExceededError 等。
  }
};
