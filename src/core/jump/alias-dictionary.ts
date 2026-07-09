// 辞書エントリは法令中心。1 法令が複数の略称を持つ。
export interface AliasDictionaryEntry {
  lawId: string; // e-Gov lawId
  officialTitle: string; // 正式名称。resolve では kind "official" のキーになる
  aliases: string[]; // 学習者向け略称。正式名称は含めない
}

// 初期辞書。e-Gov の abbrev（公式略称）を全て取り込み、e-Gov に無い学習者略称（単字・短縮形）を加えた静的データ。
// 各 lawId と abbrev 由来の略称は e-Gov /api/2/laws の実レスポンスで検証済み（2026-07-10）。
export const initialAliasDictionary: AliasDictionaryEntry[] = [
  { lawId: "321CONSTITUTION", officialTitle: "日本国憲法", aliases: ["憲", "憲法"] },
  { lawId: "129AC0000000089", officialTitle: "民法", aliases: ["民"] },
  { lawId: "132AC0000000048", officialTitle: "商法", aliases: ["商"] },
  { lawId: "140AC0000000045", officialTitle: "刑法", aliases: ["刑"] },
  { lawId: "408AC0000000109", officialTitle: "民事訴訟法", aliases: ["民訴法", "民訴"] },
  { lawId: "323AC0000000131", officialTitle: "刑事訴訟法", aliases: ["刑訴法", "刑訴"] },
  { lawId: "405AC0000000088", officialTitle: "行政手続法", aliases: ["行手法", "行手"] },
  {
    lawId: "426AC0000000068",
    officialTitle: "行政不服審査法",
    // 行審法・行服法はいずれも e-Gov abbrev の公式略称。行審は学習者略称。
    aliases: ["行審法", "行服法", "行審"],
  },
  { lawId: "337AC0000000139", officialTitle: "行政事件訴訟法", aliases: ["行訴法", "行訴"] },
  { lawId: "322AC0000000125", officialTitle: "国家賠償法", aliases: ["国賠法", "国賠"] },
  { lawId: "322AC0000000067", officialTitle: "地方自治法", aliases: ["地自法", "地自", "自治法"] },
  {
    lawId: "415AC0000000057",
    officialTitle: "個人情報の保護に関する法律",
    aliases: ["個情法", "個人情報保護法"],
  },
  // 会社法は正式名称がそのまま通称。略称は持たず、正式名称キーで解決する。
  { lawId: "417AC0000000086", officialTitle: "会社法", aliases: [] },
];
