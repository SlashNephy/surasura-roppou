import type { LawRepository } from "@/core/egov";
import type { SearchIndexRepository } from "@/core/search";
import type { LawCatalogEntry } from "@/core/storage";

import {
  deriveLawIdFromLawNumber,
  lawNumberKey,
  lawNumberTypeCode,
  parseLawNumber,
  type ParsedLawNumber,
} from "./law-number";

export interface LawNumberResolver {
  // キャッシュ優先で lawId を返す。解決できなければ undefined。
  resolve(parsed: ParsedLawNumber, options?: { signal?: AbortSignal }): Promise<string | undefined>;
}

export interface LawNumberResolverDependencies {
  lawRepository: LawRepository;
  indexRepository: SearchIndexRepository;
  // catalog.ts と同じく、テストで固定できるよう now を注入可能にする。
  now?: () => Date;
}

// fetch の中断は DOMException("AbortError")。名前で判定する（catalog.ts と同じ方針）。
const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const toCatalogEntry = (
  law: {
    lawId: string;
    title: string;
    lawNumber?: string;
    lawType?: string;
    aliases: string[];
  },
  now: () => Date,
): LawCatalogEntry => ({
  lawId: law.lawId,
  title: law.title,
  ...(law.lawNumber === undefined ? {} : { lawNumber: law.lawNumber }),
  ...(law.lawType === undefined ? {} : { lawType: law.lawType }),
  aliases: law.aliases,
  cachedAt: now().toISOString(),
});

export const createLawNumberResolver = ({
  indexRepository,
  lawRepository,
  now = () => new Date(),
}: LawNumberResolverDependencies): LawNumberResolver => {
  // 解決済みと、解決できなかったものの記憶。同じ法令番号を何度も問い合わせない。
  const resolved = new Map<string, string>();
  const unresolvable = new Set<string>();
  // 起動から一度だけカタログを読む。法令を切り替えるたびに読み直さない。
  let cachedCatalog: Promise<Map<string, string>> | undefined;

  const loadCatalogIndex = async (): Promise<Map<string, string>> => {
    const entries = await indexRepository.listCatalog();
    const index = new Map<string, string>();

    for (const entry of entries) {
      if (entry.lawNumber === undefined) {
        continue;
      }

      const parsed = parseLawNumber(entry.lawNumber);

      if (parsed !== undefined) {
        index.set(lawNumberKey(parsed), entry.lawId);
      }
    }

    return index;
  };

  // 問い合わせ中の約束。解決済みの記憶へ載るのは応答後なので、同じ法令番号を同時に
  // 解決しようとすると memo をすり抜けて二重に問い合わせてしまう。
  const inFlight = new Map<string, Promise<string | undefined>>();

  const request = async (
    parsed: ParsedLawNumber,
    key: string,
    signal: AbortSignal | undefined,
  ): Promise<string | undefined> => {
    // キャッシュは種別によらず引く。省令のように法令番号から問い合わせられない種別でも、
    // 検索経由でカタログに入っていれば解決できる。
    cachedCatalog ??= loadCatalogIndex();
    const cachedLawId = (await cachedCatalog).get(key);

    if (cachedLawId !== undefined) {
      resolved.set(key, cachedLawId);
      return cachedLawId;
    }

    const typeCode = lawNumberTypeCode(parsed.type);

    if (typeCode === undefined) {
      // 府令・省令などは法令番号から引けない。問い合わせずに諦める。
      unresolvable.add(key);
      return undefined;
    }

    let result;

    try {
      result = await lawRepository.listLaws(
        {
          lawNumberEra: parsed.era,
          lawNumberYear: parsed.year,
          lawNumberType: typeCode,
          lawNumberNumber: parsed.number,
          limit: 1,
        },
        signal === undefined ? {} : { signal },
      );
    } catch (error) {
      // 中断は正常系。失敗として覚えず、呼び出し側へ伝播させる。
      if (isAbortError(error)) {
        throw error;
      }

      // ネットワーク不通などは失敗として覚え、同じセッション中は再試行しない。
      unresolvable.add(key);
      return undefined;
    }

    // noUncheckedIndexedAccess が無効なため [0] だと undefined が型に現れず lint に落ちる。
    // .at(0) は型定義上も T | undefined を返すため、空配列という異常系を検査できる。
    const law = result.laws.at(0)?.law;

    // 一意に引けたときだけ採る。複数ヒットはどれか決められない。
    if (result.totalCount !== 1 || law === undefined) {
      unresolvable.add(key);
      return undefined;
    }

    resolved.set(key, law.lawId);
    await indexRepository.upsertCatalogEntries([toCatalogEntry(law, now)]);

    return law.lawId;
  };

  return {
    async resolve(parsed, options = {}) {
      const derived = deriveLawIdFromLawNumber(parsed);

      if (derived !== undefined) {
        return derived;
      }

      const key = lawNumberKey(parsed);
      const known = resolved.get(key);

      if (known !== undefined) {
        return known;
      }

      if (unresolvable.has(key)) {
        return undefined;
      }

      const pending = inFlight.get(key);

      if (pending !== undefined) {
        return pending;
      }

      const started = request(parsed, key, options.signal).finally(() => {
        inFlight.delete(key);
      });

      inFlight.set(key, started);

      return started;
    },
  };
};
