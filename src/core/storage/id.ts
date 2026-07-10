// ブックマーク等のストレージ保存時に使う一意 ID を生成する。
// crypto.randomUUID が利用できる環境ではそちらを優先し、
// 利用できない環境（テスト環境・古いブラウザ等）では Date.now と Math.random を
// 組み合わせた簡易フォールバックで衝突リスクを最小限に抑える。
export const generateStorageId = (): string => {
  const browserCrypto = (globalThis as { crypto?: Crypto }).crypto;

  if (browserCrypto === undefined) {
    return generateFallbackId();
  }

  if (typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  // randomUUID がなくても getRandomValues があれば使う（一部の古いブラウザ向け）。
  if (typeof browserCrypto.getRandomValues === "function") {
    const values = new Uint32Array(2);
    browserCrypto.getRandomValues(values);

    return `${Date.now().toString(36)}-${values[0].toString(36)}${values[1].toString(36)}`;
  }

  return generateFallbackId();
};

// crypto が一切使えない環境向けの最終フォールバック。
// 完全な一意性は保証しないが、通常用途では衝突リスクは極めて低い。
const generateFallbackId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
