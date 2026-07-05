export type ReadabilityTransformMode =
  "article-number" | "date" | "law-number" | "parentheses" | "unchanged";

export interface ReadabilityTransformFixture {
  name: string;
  mode: ReadabilityTransformMode;
  input: string;
  expected: string;
}

export const readabilityTransformFixtures = [
  {
    name: "article title kanji number",
    mode: "article-number",
    input: "第一条",
    expected: "第1条",
  },
  {
    name: "branch article title kanji number",
    mode: "article-number",
    input: "第十二条の二",
    expected: "第12条の2",
  },
  {
    name: "paragraph kanji number",
    mode: "article-number",
    input: "第三項",
    expected: "第3項",
  },
  {
    name: "item kanji number",
    mode: "article-number",
    input: "第一号",
    expected: "第1号",
  },
  {
    name: "appendix table kanji number",
    mode: "article-number",
    input: "別表第一",
    expected: "別表1",
  },
  {
    name: "japanese era date",
    mode: "date",
    input: "令和六年四月一日",
    expected: "令和6年4月1日",
  },
  {
    name: "law number date phrase",
    mode: "law-number",
    input: "平成五年法律第八十八号",
    expected: "平成5年法律第88号",
  },
  {
    name: "full-width parentheses",
    mode: "parentheses",
    input: "損害（精神的損害を含む。）",
    expected: "損害(精神的損害を含む。)",
  },
  {
    name: "common word containing ichi remains unchanged",
    mode: "unchanged",
    input: "一般",
    expected: "一般",
  },
  {
    name: "word containing ichi meaning part remains unchanged",
    mode: "unchanged",
    input: "一部",
    expected: "一部",
  },
  {
    name: "word containing ichi meaning identical remains unchanged",
    mode: "unchanged",
    input: "同一",
    expected: "同一",
  },
  {
    name: "third party remains unchanged",
    mode: "unchanged",
    input: "第三者",
    expected: "第三者",
  },
  {
    name: "first instance remains unchanged",
    mode: "unchanged",
    input: "第一審",
    expected: "第一審",
  },
  {
    name: "legal prose containing ichi remains unchanged",
    mode: "unchanged",
    input: "第一義的な解釈に限らない。",
    expected: "第一義的な解釈に限らない。",
  },
] satisfies ReadabilityTransformFixture[];
