export interface LawReferenceParseFixture {
  name: string;
  kind: "absolute" | "relative";
  input: string;
  expected: {
    lawNameCandidate?: string;
    lawAlias?: string;
    article?: string;
    paragraph?: string;
    item?: string;
    // 本文 / ただし書 の位置指定。
    sentence?: "main" | "proviso";
    // 別表番号（別表第一 → "1"）。
    appendix?: string;
    confidenceFloor: number;
  };
}

export const lawReferenceParseFixtures = [
  {
    name: "full law name and article",
    kind: "absolute",
    input: "国家賠償法第1条",
    expected: {
      lawNameCandidate: "国家賠償法",
      article: "1",
      confidenceFloor: 0.9,
    },
  },
  {
    name: "short alias and article",
    kind: "absolute",
    input: "国賠1",
    expected: {
      lawAlias: "国賠",
      article: "1",
      confidenceFloor: 0.8,
    },
  },
  {
    name: "civil code abbreviated article",
    kind: "absolute",
    input: "民709",
    expected: {
      lawAlias: "民",
      article: "709",
      confidenceFloor: 0.8,
    },
  },
  {
    name: "administrative procedure law article",
    kind: "absolute",
    input: "行政手続法14条",
    expected: {
      lawNameCandidate: "行政手続法",
      article: "14",
      confidenceFloor: 0.9,
    },
  },
  {
    name: "local autonomy branch article",
    kind: "absolute",
    input: "地方自治法242条の2",
    expected: {
      lawNameCandidate: "地方自治法",
      article: "242-2",
      confidenceFloor: 0.85,
    },
  },
  {
    name: "kanji branch article",
    kind: "absolute",
    input: "民法第七百九条の二",
    expected: {
      lawNameCandidate: "民法",
      article: "709-2",
      confidenceFloor: 0.75,
    },
  },
  {
    name: "constitution article and paragraph",
    kind: "absolute",
    input: "憲法21条1項",
    expected: {
      lawAlias: "憲法",
      article: "21",
      paragraph: "1",
      confidenceFloor: 0.85,
    },
  },
  {
    name: "kanji article paragraph item",
    kind: "absolute",
    input: "民法第七百九条第一項第一号",
    expected: {
      lawNameCandidate: "民法",
      article: "709",
      paragraph: "1",
      item: "1",
      confidenceFloor: 0.75,
    },
  },
  {
    name: "relative previous paragraph",
    kind: "relative",
    input: "前項",
    expected: {
      paragraph: "previous",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "relative next paragraph",
    kind: "relative",
    input: "次項",
    expected: {
      paragraph: "next",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "same article item",
    kind: "relative",
    input: "同条第一号",
    expected: {
      item: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "same paragraph item",
    kind: "relative",
    input: "同項第一号",
    expected: {
      item: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "same-law absolute-in-context article",
    kind: "relative",
    input: "同法1条",
    expected: {
      article: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "relative previous article",
    kind: "relative",
    input: "前条",
    expected: {
      article: "previous",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "relative next article",
    kind: "relative",
    input: "次条",
    expected: {
      article: "next",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "main sentence marker",
    kind: "relative",
    input: "本文",
    expected: {
      sentence: "main",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "proviso sentence marker",
    kind: "relative",
    input: "ただし書",
    expected: {
      sentence: "proviso",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "appendix table kanji",
    kind: "relative",
    input: "別表第一",
    expected: {
      appendix: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "alias arabic article roman paragraph",
    kind: "absolute",
    input: "憲21Ⅰ",
    expected: {
      lawAlias: "憲",
      article: "21",
      paragraph: "1",
      confidenceFloor: 0.8,
    },
  },
  {
    name: "kanji article paragraph item no law",
    kind: "relative",
    input: "一条二項三号",
    expected: {
      article: "1",
      paragraph: "2",
      item: "3",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "arabic article paragraph item no law",
    kind: "relative",
    input: "1条1項1号",
    expected: {
      article: "1",
      paragraph: "1",
      item: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "prefixed article paragraph item no law",
    kind: "relative",
    input: "第1条第1項第1号",
    expected: {
      article: "1",
      paragraph: "1",
      item: "1",
      confidenceFloor: 0.4,
    },
  },
] satisfies LawReferenceParseFixture[];
