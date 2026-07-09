import { normalizeForSearch } from "@/core/search";

import { initialAliasDictionary, type AliasDictionaryEntry } from "./alias-dictionary";

// 候補が正式名称と略称のどちらで一致したか。
export type AliasMatchKind = "official" | "alias";

export interface AliasCandidate {
  // resolve は配列を複製して返すが、要素オブジェクトは参照共有される。
  // 各プロパティを readonly にして消費側の書き換えを型で封じ、不変性を確実にする。
  readonly lawId: string;
  readonly officialTitle: string;
  readonly matchedText: string; // 辞書に登録された、一致した表記（正規化前の原文）
  readonly matchKind: AliasMatchKind;
}

export interface AliasResolverOptions {
  // 組込辞書に加算するユーザー辞書。将来のユーザー編集・BFF 配信の受け口。
  userEntries?: AliasDictionaryEntry[];
}

export interface AliasResolver {
  // クリーンな法令名トークンを候補配列に解決する。未知語・空文字は空配列。
  resolve(input: string): AliasCandidate[];
}

// 照合キーは検索と同じ正規化（NFKC・小文字化・空白除去）で作る。
// 部分一致は採らない。完全一致にすることで「民」が「民法」の正式名称へ誤ヒットしない。
const normalizeKey = (text: string): string => normalizeForSearch(text).normalized;

export const createAliasResolver = (options: AliasResolverOptions = {}): AliasResolver => {
  const index = new Map<string, AliasCandidate[]>();

  const register = (key: string, candidate: AliasCandidate): void => {
    // 空キー（空文字・空白のみの表記）は引けないので登録しない。
    if (key === "") {
      return;
    }

    const bucket = index.get(key);

    if (bucket === undefined) {
      index.set(key, [candidate]);
      return;
    }

    // 同一バケット（＝正規化キーが同一）内で lawId と matchKind が同じなら、
    // 元表記（matchedText）が違っても消費側からは実質同じ候補なので重複とみなす。
    // 例: 同一法令の別名「民訴」と「民 訴」は同じキー "民訴" に落ちるため 1 件に畳む。
    const duplicated = bucket.some(
      (existing) =>
        existing.lawId === candidate.lawId && existing.matchKind === candidate.matchKind,
    );

    if (!duplicated) {
      bucket.push(candidate);
    }
  };

  // 組込辞書 → userEntries の順で登録し、候補の順序を決定的にする。
  const entries = [...initialAliasDictionary, ...(options.userEntries ?? [])];

  for (const entry of entries) {
    register(normalizeKey(entry.officialTitle), {
      lawId: entry.lawId,
      officialTitle: entry.officialTitle,
      matchedText: entry.officialTitle,
      matchKind: "official",
    });

    for (const alias of entry.aliases) {
      register(normalizeKey(alias), {
        lawId: entry.lawId,
        officialTitle: entry.officialTitle,
        matchedText: alias,
        matchKind: "alias",
      });
    }
  }

  return {
    resolve(input) {
      const candidates = index.get(normalizeKey(input));

      // インデックス内の配列を直接返すと呼び出し側の変更が辞書へ漏れるため複製して返す。
      return candidates === undefined ? [] : [...candidates];
    },
  };
};
