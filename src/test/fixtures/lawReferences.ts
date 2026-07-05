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
] satisfies LawReferenceParseFixture[];
