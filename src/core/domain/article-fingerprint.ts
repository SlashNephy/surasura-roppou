// 条ノードの plainText から改変検知用の指紋を作る。
// NFKC 正規化 → 空白除去 → SHA-256 → 16 進表現の先頭 16 文字。
// 目的は改変検知であり衝突耐性は要求しないため 64 bit(16 hex)で十分。
// 照合用の normalizeForSearch は小文字化するため再利用しない（大文字小文字差も検知したい）。
export const computeArticleFingerprint = async (plainText: string): Promise<string> => {
  const normalized = plainText.normalize("NFKC").replace(/\s/gu, "");
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
};
