import type { LawNode } from "@/core/domain";

export interface QuizFixtureArticle {
  // 正規化後の条番号。枝番は "242-2" のようにハイフン区切り（lawText.ts の extractNumberFromTitle に合わせる）。
  number: string;
  // 原文の条見出し。例: "第七百九条"
  title: string;
  caption?: string;
  // 各項の本文（項番号ラベルなし）。
  paragraphs: string[];
}

interface QuizFixtureOptions {
  lawId?: string;
  revisionId?: string;
}

// クイズ生成テスト用の Article + Paragraph ノード群を組み立てる。
// plainText の形は正規化層（normalizeEgovLawText）の出力に合わせる:
// - Article の plainText は caption / title / 各項本文をスペース連結したもの
// - Paragraph の第 2 項以降は plainText の先頭に項番号ラベル（title）が付く
export const createQuizLawNodes = (
  articles: QuizFixtureArticle[],
  { lawId = "129AC0000000089", revisionId = "rev-1" }: QuizFixtureOptions = {},
): LawNode[] => {
  const nodes: LawNode[] = [];

  for (const spec of articles) {
    const articleId = `${lawId}:${revisionId}:article:${spec.number}`;
    const paragraphNodes: LawNode[] = spec.paragraphs.map((text, index) => {
      const paragraphNumber = String(index + 1);
      // e-Gov の第 1 項は ParagraphNum が空のため title を持たない。
      const title = index === 0 ? undefined : paragraphNumber;

      return {
        id: `${articleId}/paragraph:${paragraphNumber}`,
        lawId,
        revisionId,
        type: "Paragraph",
        path: `article:${spec.number}/paragraph:${paragraphNumber}`,
        number: paragraphNumber,
        ...(title === undefined ? {} : { title }),
        rawText: text,
        plainText: title === undefined ? text : `${title} ${text}`,
        children: [],
        parentId: articleId,
      };
    });

    nodes.push(
      {
        id: articleId,
        lawId,
        revisionId,
        type: "Article",
        path: `article:${spec.number}`,
        number: spec.number,
        title: spec.title,
        ...(spec.caption === undefined ? {} : { caption: spec.caption }),
        rawText: [spec.title, ...spec.paragraphs].join(""),
        plainText: [spec.caption, spec.title, ...spec.paragraphs]
          .filter((part): part is string => part !== undefined)
          .join(" "),
        children: paragraphNodes.map((node) => node.id),
      },
      ...paragraphNodes,
    );
  }

  return nodes;
};

export const findQuizArticle = (nodes: LawNode[], number: string): LawNode => {
  const article = nodes.find((node) => node.type === "Article" && node.number === number);

  if (article === undefined) {
    throw new Error(`article ${number} not found in fixture`);
  }

  return article;
};
