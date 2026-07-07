import type { Law, LawNode, LawRevision } from "@/core/domain";
import { buildLawArticleUrl } from "@/core/domain";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { applyLawTextDisplayMode } from "./displayMode";

export type ArticleCopyFormat = "original" | "readable" | "source" | "markdown" | "url";

interface BuildArticleCopyTextInput {
  article: LawNode;
  baseUrl: string;
  format: ArticleCopyFormat;
  law: Law;
  revision: LawRevision;
}

export const buildArticleCopyText = ({
  article,
  baseUrl,
  format,
  law,
  revision,
}: BuildArticleCopyTextInput): string => {
  const url = buildAbsoluteArticleUrl({ article, baseUrl, law });

  switch (format) {
    case "original":
      return getOriginalArticleText(article);

    case "readable":
      return applyLawTextDisplayMode(article.plainText, "readable");

    case "source":
      return [
        getOriginalArticleText(article),
        "",
        `出典: ${law.title} ${getArticleLabel(article)}（e-Gov 法令検索、取得日: ${formatIsoDateLabel(revision.fetchedAt)}）`,
        url,
      ].join("\n");

    case "markdown":
      return [
        `> ${getOriginalArticleText(article)}`,
        "",
        `[${law.title} ${getArticleLabel(article)}](${url})`,
      ].join("\n");

    case "url":
      return url;
  }
};

const buildAbsoluteArticleUrl = ({
  article,
  baseUrl,
  law,
}: {
  article: LawNode;
  baseUrl: string;
  law: Law;
}): string => {
  const relativeUrl = buildLawArticleUrl({
    lawId: law.lawId,
    ...(article.number === undefined ? {} : { article: article.number }),
  });

  return new URL(relativeUrl, baseUrl).toString();
};

const getOriginalArticleText = (article: LawNode): string =>
  article.rawText === "" ? article.plainText : article.rawText;

const getArticleLabel = (article: LawNode): string => article.title ?? article.number ?? "条文";
