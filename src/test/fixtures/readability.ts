import type { ReadabilityTransformMode } from "@/shared/utils/readability";

export interface ReadabilityTransformFixture {
  name: string;
  mode: ReadabilityTransformMode;
  input: string;
  expected: string;
}

export interface ReadabilityHeadingTransformFixture {
  name: string;
  input: string;
  expected: string;
}

export const readabilityHeadingTransformFixtures = [
  {
    name: "part title kanji number",
    input: "第一編",
    expected: "第1編",
  },
  {
    name: "chapter title kanji number",
    input: "第二章",
    expected: "第2章",
  },
  {
    name: "section title kanji number",
    input: "第三節",
    expected: "第3節",
  },
  {
    name: "subsection title kanji number",
    input: "第四款",
    expected: "第4款",
  },
  {
    name: "division title kanji number",
    input: "第五目",
    expected: "第5目",
  },
  {
    name: "real branch chapter title",
    input: "第四章の二　処分等の求め",
    expected: "第4章の2　処分等の求め",
  },
  {
    name: "nested branch chapter title",
    input: "第四章の二の三　手続",
    expected: "第4章の2の3　手続",
  },
  {
    name: "branch section title",
    input: "第三節の二",
    expected: "第3節の2",
  },
  {
    name: "branch subsection title",
    input: "第一款の二",
    expected: "第1款の2",
  },
  {
    name: "article title uses existing transform",
    input: "第一条",
    expected: "第1条",
  },
  {
    name: "appendix title uses existing transform",
    input: "別表第一",
    expected: "別表1",
  },
] satisfies ReadabilityHeadingTransformFixture[];

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
    name: "duration in years with span suffix",
    mode: "quantity",
    input: "一年間",
    expected: "1年間",
  },
  {
    name: "duration in years",
    mode: "quantity",
    input: "一年",
    expected: "1年",
  },
  {
    name: "duration in months",
    mode: "quantity",
    input: "三箇月",
    expected: "3箇月",
  },
  {
    name: "duration in weeks",
    mode: "quantity",
    input: "二週間",
    expected: "2週間",
  },
  {
    name: "deadline in days",
    mode: "quantity",
    input: "三日以内",
    expected: "3日以内",
  },
  {
    name: "bare number with lower bound",
    mode: "quantity",
    input: "二以上の法令",
    expected: "2以上の法令",
  },
  {
    name: "preceding article reference",
    mode: "quantity",
    input: "前三条",
    expected: "前3条",
  },
  {
    name: "preceding paragraph reference",
    mode: "quantity",
    input: "前二項",
    expected: "前2項",
  },
  {
    name: "measurement unit",
    mode: "quantity",
    input: "総トン数二十トン",
    expected: "総トン数20トン",
  },
  {
    name: "counter for documents",
    mode: "quantity",
    input: "一通又は数通を交付しなければならない",
    expected: "1通又は数通を交付しなければならない",
  },
  {
    name: "counter for people",
    mode: "quantity",
    input: "二人以上の所持人がある場合において、その一人が",
    expected: "2人以上の所持人がある場合において、その1人が",
  },
  {
    name: "fraction",
    mode: "quantity",
    input: "その三分の二を船舶所有者に支払う",
    expected: "その3分の2を船舶所有者に支払う",
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
