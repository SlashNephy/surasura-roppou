import { useEffect, useMemo, useState } from "react";

import type { LawNode } from "@/core/domain";
import {
  lawNumberKey,
  parseLawNumber,
  type LawNumberResolver,
  type ParsedLawNumber,
} from "@/core/jump";

// 本文中の法令番号の括弧書き。中身は parseLawNumber に委ねるため、括弧の中を粗く取る。
const lawNumberParenthesisPattern = /[（(]([^）)]{1,60})[）)]/g;

// 同時に投げる問い合わせの数。法令によっては 60 件以上あるため、上限を設けて
// e-Gov への一斉アクセスを避ける。
const concurrency = 6;

// 走査結果が無いときに返す空の表。毎描画で作り直すと、この表を deps に持つ
// 下流のメモが無駄に壊れるため、参照を固定する。
const emptyLawIdByLawNumber: ReadonlyMap<string, string> = new Map();

// どの走査結果に対する解決かを覚えておく。法令が変わって走査結果が入れ替わったら、
// 前の法令の対応表は使わない。
interface ResolvedLawIds {
  lawNumbers: ReadonlyMap<string, ParsedLawNumber>;
  resolver: LawNumberResolver;
  lawIdByLawNumber: ReadonlyMap<string, string>;
}

// 本文を走査して法令番号を重複排除する。表示モードによらず plainText を見る。
// 表記が漢数字でも算用数字でもキーは同じになるため、どちらでも突き合わせられる。
const collectLawNumbers = (nodes: LawNode[]): Map<string, ParsedLawNumber> => {
  const byKey = new Map<string, ParsedLawNumber>();

  for (const node of nodes) {
    for (const match of node.plainText.matchAll(lawNumberParenthesisPattern)) {
      const parsed = parseLawNumber(match[1]);

      if (parsed !== undefined) {
        byKey.set(lawNumberKey(parsed), parsed);
      }
    }
  }

  return byKey;
};

// 本文中の法令番号を解決し、解決できたものから対応表へ載せる。
// 解決は非同期だが、リンク化そのものは同期のままにしたいため、結果を表として返す。
export const useCrossLawNumbers = (
  nodes: LawNode[],
  resolver: LawNumberResolver,
): ReadonlyMap<string, string> => {
  const [resolved, setResolved] = useState<ResolvedLawIds | undefined>(undefined);
  const lawNumbers = useMemo(() => collectLawNumbers(nodes), [nodes]);

  useEffect(() => {
    const controller = new AbortController();
    // 中断は都度読み直す。await をまたぐと型の絞り込みが残り、読み値が固定されてしまう。
    const isAborted = (): boolean => controller.signal.aborted;
    const entries = [...lawNumbers.values()];
    // 走査結果を順に取り出す共有カーソル。await の前に進めるため、同じ法令番号を
    // 複数のワーカーが二重に引き当てることはない。
    let cursor = 0;

    const runWorker = async (): Promise<void> => {
      while (cursor < entries.length && !isAborted()) {
        const parsed = entries[cursor];
        cursor += 1;

        const lawId = await resolver.resolve(parsed, { signal: controller.signal });

        // 中断後は表を触らない。法令を切り替えた後や、画面を離れた後の反映を防ぐ。
        if (lawId === undefined || isAborted()) {
          continue;
        }

        setResolved((previous) => {
          // 前の法令の対応表には積み増さない。走査結果と解決器が同じときだけ引き継ぐ。
          const base =
            previous?.lawNumbers === lawNumbers && previous.resolver === resolver
              ? previous.lawIdByLawNumber
              : emptyLawIdByLawNumber;

          return {
            lawNumbers,
            resolver,
            lawIdByLawNumber: new Map(base).set(lawNumberKey(parsed), lawId),
          };
        });
      }
    };

    const run = async () => {
      try {
        // 上限の数だけワーカーを並べ、共有カーソルを食い合わせて並列度を抑える。
        await Promise.all(Array.from({ length: concurrency }, runWorker));
      } catch {
        // 中断とネットワークの失敗はリンクが出ないだけ。ここでは握って進める。
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [lawNumbers, resolver]);

  // 法令が変わった直後は、まだ前の法令の対応表が state に残っている。描画時に
  // 突き合わせて捨てることで、effect の中で同期的に state を書き戻さずに済む。
  return resolved?.lawNumbers === lawNumbers && resolved.resolver === resolver
    ? resolved.lawIdByLawNumber
    : emptyLawIdByLawNumber;
};
