import type { LawNode, LawNodeType, RubyAnnotation } from "@/core/domain";

export interface EgovLawTextNode {
  tag: string;
  attr: Record<string, string | number | boolean | undefined>;
  children: (EgovLawTextNode | string)[];
}

// 号の細分は階層ごとに Subitem1〜Subitem10 という別タグで表される。
// すらすら六法では階層の深さを木構造で表すため、いずれも Subitem 種別へ寄せる。
const subitemTags = Array.from({ length: 10 }, (_, index) => `Subitem${String(index + 1)}`);

const nodeTypeByTag: Partial<Record<string, LawNodeType>> = {
  Part: "Part",
  Chapter: "Chapter",
  Section: "Section",
  Subsection: "Subsection",
  Division: "Division",
  Article: "Article",
  Paragraph: "Paragraph",
  Item: "Item",
  ...Object.fromEntries(subitemTags.map((tag) => [tag, "Subitem"] as const)),
  SupplProvision: "SupplementaryProvision",
  AppdxTable: "AppdxTable",
  AppdxStyle: "AppdxStyle",
} satisfies Partial<Record<string, LawNodeType>>;

const pathSegmentByType = {
  Part: "part",
  Chapter: "chapter",
  Section: "section",
  Subsection: "subsection",
  Division: "division",
  Article: "article",
  Paragraph: "paragraph",
  Item: "item",
  Subitem: "subitem",
  SupplementaryProvision: "supplementary-provision",
  AppdxTable: "appdx-table",
  AppdxStyle: "appdx-style",
} satisfies Record<LawNodeType, string>;

const titleTagByType = {
  Part: "PartTitle",
  Chapter: "ChapterTitle",
  Section: "SectionTitle",
  Subsection: "SubsectionTitle",
  Division: "DivisionTitle",
  Article: "ArticleTitle",
  Paragraph: "ParagraphNum",
  Item: "ItemTitle",
  SupplementaryProvision: "SupplProvisionLabel",
  AppdxTable: "AppdxTableTitle",
  AppdxStyle: "AppdxStyleTitle",
  // Subitem の見出しタグは階層番号を含む（Subitem1Title など）ため、タグ名から導く。
} satisfies Record<Exclude<LawNodeType, "Subitem">, string>;

const getTitleTag = (apiNode: EgovLawTextNode, nodeType: LawNodeType): string =>
  nodeType === "Subitem" ? `${apiNode.tag}Title` : titleTagByType[nodeType];

// 見出しのかっこ書き（例: （基本原則））を持つノード種別だけ対象にする。
// 項見出しは附則直下の項に付くことが多く、拾わないと本文テキストに混ざる。
const captionTagByType: Partial<Record<LawNodeType, string>> = {
  Article: "ArticleCaption",
  Paragraph: "ParagraphCaption",
};

export const normalizeEgovLawText = (
  root: EgovLawTextNode,
  lawId: string,
  revisionId: string,
): LawNode[] => {
  const nodes: LawNode[] = [];
  const typeCounters = new Map<string, Partial<Record<LawNodeType, number>>>();

  const walk = (
    apiNode: EgovLawTextNode,
    parentId: string | undefined,
    parentPath: string,
  ): string[] => {
    const nodeType = nodeTypeByTag[apiNode.tag];

    if (nodeType === undefined) {
      return apiNode.children.flatMap((child) =>
        typeof child === "string" ? [] : walk(child, parentId, parentPath),
      );
    }

    const siblingIndex = nextNodeTypeIndex(typeCounters, parentPath, nodeType);
    const number = getNodeNumber(apiNode, nodeType) ?? String(siblingIndex);
    const path = appendPath(parentPath, `${pathSegmentByType[nodeType]}:${number}`);
    const nodeId = `${lawId}:${revisionId}:${path}`;
    const rawTitle = getNodeTitle(apiNode, nodeType);
    const title = rawTitle === undefined || rawTitle.trim() === "" ? undefined : rawTitle;
    const rawCaption = getNodeCaption(apiNode, nodeType);
    const caption = rawCaption === undefined || rawCaption.trim() === "" ? undefined : rawCaption;
    const plainText = collectPlainText(apiNode);
    const rubyAnnotations = collectRubyAnnotations(apiNode);
    const lawNode: LawNode = {
      id: nodeId,
      lawId,
      revisionId,
      type: nodeType,
      path,
      number,
      ...(title === undefined ? {} : { title }),
      ...(caption === undefined ? {} : { caption }),
      rawText: collectRawText(apiNode),
      plainText,
      normalizedText: plainText,
      ...(rubyAnnotations.length === 0 ? {} : { rubyAnnotations }),
      children: [],
      ...(parentId === undefined ? {} : { parentId }),
    };

    nodes.push(lawNode);

    apiNode.children.forEach((child) => {
      if (typeof child === "string") {
        return;
      }

      lawNode.children.push(...walk(child, nodeId, path));
    });

    return [nodeId];
  };

  walk(root, undefined, "");

  return nodes;
};

const nextNodeTypeIndex = (
  typeCounters: Map<string, Partial<Record<LawNodeType, number>>>,
  parentPath: string,
  nodeType: LawNodeType,
): number => {
  const counters = typeCounters.get(parentPath) ?? {};
  const nextIndex = (counters[nodeType] ?? 0) + 1;

  counters[nodeType] = nextIndex;
  typeCounters.set(parentPath, counters);

  return nextIndex;
};

const appendPath = (parentPath: string, segment: string): string =>
  parentPath === "" ? segment : `${parentPath}/${segment}`;

const getNodeNumber = (apiNode: EgovLawTextNode, nodeType: LawNodeType): string | undefined => {
  const attrNumber = stringifyAttribute(apiNode.attr.Num);

  if (attrNumber !== undefined && attrNumber !== "") {
    return normalizeNumberText(attrNumber);
  }

  const title = getNodeTitle(apiNode, nodeType);

  return title === undefined ? undefined : extractNumberFromTitle(title, nodeType);
};

const getNodeTitle = (apiNode: EgovLawTextNode, nodeType: LawNodeType): string | undefined => {
  const titleTag = getTitleTag(apiNode, nodeType);
  const titleNode = apiNode.children.find(
    (child): child is EgovLawTextNode => typeof child !== "string" && child.tag === titleTag,
  );

  return titleNode === undefined ? undefined : collectRawText(titleNode);
};

const getNodeCaption = (apiNode: EgovLawTextNode, nodeType: LawNodeType): string | undefined => {
  const captionTag = captionTagByType[nodeType];

  if (captionTag === undefined) {
    return undefined;
  }

  const captionNode = apiNode.children.find(
    (child): child is EgovLawTextNode => typeof child !== "string" && child.tag === captionTag,
  );

  return captionNode === undefined ? undefined : collectRawText(captionNode);
};

const extractNumberFromTitle = (title: string, nodeType: LawNodeType): string | undefined => {
  switch (nodeType) {
    case "Article": {
      const match = /^第(.+?)条(?:の(.+))?$/.exec(title.trim());
      if (match === null) {
        return undefined;
      }

      const article = normalizeNumberText(match[1]);
      const branchText = match.at(2);
      const branch = branchText === undefined ? undefined : normalizeNumberSegments(branchText);

      return branch === undefined ? article : `${article}-${branch}`;
    }
    case "Paragraph":
    case "Item":
    case "Subitem": {
      const trimmed = title.trim();
      const match = /^第?(.+?)[項号](?:の(.+))?$/.exec(trimmed);

      if (match === null) {
        return normalizeNumberSegments(trimmed);
      }

      const main = normalizeNumberText(match[1]);
      const branchText = match.at(2);
      const branch = branchText === undefined ? undefined : normalizeNumberSegments(branchText);

      return branch === undefined ? main : `${main}-${branch}`;
    }
    case "AppdxTable":
    case "AppdxStyle": {
      const match = /^別(?:表|記様式)(.+)$/.exec(title.trim());

      return match === null ? undefined : normalizeNumberSegments(match[1]);
    }
    default:
      return undefined;
  }
};

const normalizeNumberSegments = (value: string): string | undefined => {
  const segments = value
    .trim()
    .split("の")
    .map((segment) => segment.trim().replace(/^第/, ""))
    .filter((segment) => segment !== "");

  return segments.length === 0 ? undefined : segments.map(normalizeNumberText).join("-");
};

// ルビの読み（<Ruby>瑕疵<Rt>かし</Rt></Ruby> の Rt）は本文ではないので、
// 原文・整形いずれのテキストからも除き、rubyAnnotations として別に持つ。
const rubyTag = "Ruby";
const rubyTextTag = "Rt";

const collectRawText = (node: EgovLawTextNode): string =>
  node.tag === rubyTextTag
    ? ""
    : joinTextParts(
        node.children.map((child) => ({
          text: typeof child === "string" ? child : collectRawText(child),
          isColumn: isColumnNode(child),
        })),
        "",
      );

// 欄（Column）に分かれた本文は、e-Gov の表示と同じく欄の境目を全角空白で区切る。
// 区切らないと「不利益処分行政庁が、…」のように定義語と定義文の切れ目が失われる。
const columnTag = "Column";
const columnSeparator = "\u3000";

const isColumnNode = (child: EgovLawTextNode | string): boolean =>
  typeof child !== "string" && child.tag === columnTag;

interface TextPart {
  text: string;
  isColumn: boolean;
}

// 空の断片は落としたうえで、欄に接する境目だけ全角空白、それ以外は既定の区切りで連結する。
const joinTextParts = (parts: TextPart[], separator: string): string =>
  parts
    .filter((part) => part.text !== "")
    .reduce(
      (joined, part, index, presentParts) =>
        index === 0
          ? part.text
          : `${joined}${part.isColumn || presentParts[index - 1].isColumn ? columnSeparator : separator}${part.text}`,
      "",
    );

const collectRubyAnnotations = (node: EgovLawTextNode): RubyAnnotation[] => {
  const annotations = new Map<string, RubyAnnotation>();

  const walk = (current: EgovLawTextNode): void => {
    if (current.tag === rubyTag) {
      const base = collectRawText(current);
      const text = current.children
        .filter(
          (child): child is EgovLawTextNode =>
            typeof child !== "string" && child.tag === rubyTextTag,
        )
        .flatMap((rt) => rt.children)
        .map((child) => (typeof child === "string" ? child : collectRawText(child)))
        .join("");

      if (base !== "" && text !== "") {
        annotations.set(`${base} ${text}`, { base, text });
      }

      return;
    }

    current.children.forEach((child) => {
      // 子の LawNode に属するルビは、その子ノード側で収集する。
      // 章や編に法令全体のルビが積み上がるのを防ぎ、描画対象の文言だけを持たせる。
      if (typeof child !== "string" && nodeTypeByTag[child.tag] === undefined) {
        walk(child);
      }
    });
  };

  walk(node);

  return [...annotations.values()];
};

const collectPlainText = (node: EgovLawTextNode): string => {
  if (node.tag === rubyTextTag) {
    return "";
  }

  const parts = node.children.map((child) => ({
    text: typeof child === "string" ? child.trim() : collectPlainText(child),
    isColumn: isColumnNode(child),
  }));

  return joinTextParts(parts, plainTextBlockTags.has(node.tag) ? " " : "");
};

const plainTextBlockTags = new Set([
  "Law",
  "LawBody",
  "Part",
  "Chapter",
  "Section",
  "Subsection",
  "Division",
  "Article",
  "Paragraph",
  "Item",
  ...subitemTags,
  "SupplProvision",
  "AppdxTable",
  "AppdxStyle",
  "TableStruct",
  "Table",
  "TableRow",
  "TableColumn",
]);

const stringifyAttribute = (value: string | number | boolean | undefined): string | undefined => {
  return value === undefined ? undefined : String(value);
};

const normalizeNumberText = (value: string): string => {
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const translated = translateFullWidthDigits(trimmed);

  if (/^\d+$/.test(translated)) {
    return translated;
  }

  return parseJapaneseNumber(translated)?.toString() ?? translated;
};

const translateFullWidthDigits = (value: string): string =>
  value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - "０".charCodeAt(0)));

const digitByKanji = new Map([
  ["〇", 0],
  ["零", 0],
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
]);

const unitByKanji = new Map([
  ["十", 10],
  ["百", 100],
  ["千", 1000],
]);

const parseJapaneseNumber = (value: string): number | undefined => {
  const chars = Array.from(value);

  if (!chars.some((char) => digitByKanji.has(char) || unitByKanji.has(char))) {
    return undefined;
  }

  if (!chars.some((char) => unitByKanji.has(char))) {
    let numberText = "";

    for (const char of chars) {
      const digit = digitByKanji.get(char);
      if (digit === undefined) {
        return undefined;
      }

      numberText += digit.toString();
    }

    return Number(numberText);
  }

  let total = 0;
  let current = 0;

  for (const char of value) {
    const digit = digitByKanji.get(char);

    if (digit !== undefined) {
      current = digit;
      continue;
    }

    const unit = unitByKanji.get(char);

    if (unit !== undefined) {
      total += (current === 0 ? 1 : current) * unit;
      current = 0;
      continue;
    }

    return undefined;
  }

  return total + current;
};
