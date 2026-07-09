import { describe, expect, it } from "vitest";

import { initialAliasDictionary, type AliasDictionaryEntry } from "./alias-dictionary";
import { createAliasResolver } from "./alias-resolver";

describe("createAliasResolver", () => {
  const resolver = createAliasResolver();

  it.each([
    { name: "略称 国賠", input: "国賠", lawId: "322AC0000000125", officialTitle: "国家賠償法" },
    {
      name: "公式略称 行服法",
      input: "行服法",
      lawId: "426AC0000000068",
      officialTitle: "行政不服審査法",
    },
    { name: "単字 民", input: "民", lawId: "129AC0000000089", officialTitle: "民法" },
    { name: "単字 憲", input: "憲", lawId: "321CONSTITUTION", officialTitle: "日本国憲法" },
    {
      name: "個情法",
      input: "個情法",
      lawId: "415AC0000000057",
      officialTitle: "個人情報の保護に関する法律",
    },
  ])("略称 $name を kind alias で解決する", ({ input, lawId, officialTitle }) => {
    expect(resolver.resolve(input)).toEqual([
      { lawId, officialTitle, matchedText: input, matchKind: "alias" },
    ]);
  });

  it("正式名称は kind official で解決する", () => {
    expect(resolver.resolve("国家賠償法")).toEqual([
      {
        lawId: "322AC0000000125",
        officialTitle: "国家賠償法",
        matchedText: "国家賠償法",
        matchKind: "official",
      },
    ]);
  });

  it("略称を持たない会社法も正式名称で解決する", () => {
    expect(resolver.resolve("会社法")).toEqual([
      {
        lawId: "417AC0000000086",
        officialTitle: "会社法",
        matchedText: "会社法",
        matchKind: "official",
      },
    ]);
  });

  it("前後空白を無視して解決する", () => {
    expect(resolver.resolve(" 国賠 ")).toEqual([
      {
        lawId: "322AC0000000125",
        officialTitle: "国家賠償法",
        matchedText: "国賠",
        matchKind: "alias",
      },
    ]);
  });

  it.each([
    { name: "未知語", input: "存在しない法" },
    { name: "空文字", input: "" },
    { name: "空白のみ", input: "  " },
  ])("$name は空配列を返す", ({ input }) => {
    expect(resolver.resolve(input)).toEqual([]);
  });

  it("全エントリの officialTitle が自エントリに解決する", () => {
    for (const entry of initialAliasDictionary) {
      expect(resolver.resolve(entry.officialTitle)).toContainEqual(
        expect.objectContaining({ lawId: entry.lawId, matchKind: "official" }),
      );
    }
  });

  it("組込辞書内では各表記が単一の lawId にのみ解決する（エントリ間のキー衝突が無い）", () => {
    for (const entry of initialAliasDictionary) {
      for (const surfaceForm of [entry.officialTitle, ...entry.aliases]) {
        const lawIds = new Set(resolver.resolve(surfaceForm).map((candidate) => candidate.lawId));
        expect(lawIds).toEqual(new Set([entry.lawId]));
      }
    }
  });

  it("resolve の戻り値を変更しても内部インデックスに影響しない", () => {
    const first = resolver.resolve("国賠");
    first.pop();
    expect(resolver.resolve("国賠")).toHaveLength(1);
  });

  describe("userEntries", () => {
    it("ユーザー辞書の新規法令を解決する", () => {
      const userEntry: AliasDictionaryEntry = {
        lawId: "USER0000000001",
        officialTitle: "架空法",
        aliases: ["架空"],
      };
      const withUser = createAliasResolver({ userEntries: [userEntry] });
      expect(withUser.resolve("架空")).toEqual([
        {
          lawId: "USER0000000001",
          officialTitle: "架空法",
          matchedText: "架空",
          matchKind: "alias",
        },
      ]);
    });

    it("組込略称と衝突するユーザー略称は両候補を登録順で返す", () => {
      const collide: AliasDictionaryEntry = {
        lawId: "USER0000000002",
        officialTitle: "紛らわしい法",
        aliases: ["民"],
      };
      const withUser = createAliasResolver({ userEntries: [collide] });
      expect(withUser.resolve("民")).toEqual([
        { lawId: "129AC0000000089", officialTitle: "民法", matchedText: "民", matchKind: "alias" },
        {
          lawId: "USER0000000002",
          officialTitle: "紛らわしい法",
          matchedText: "民",
          matchKind: "alias",
        },
      ]);
    });
  });
});
