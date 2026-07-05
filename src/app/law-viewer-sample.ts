import type { Law, LawNode, LawRevision } from "@/core/domain";

export interface LawViewerDocument {
  law: Law;
  revision: LawRevision;
  nodes: LawNode[];
  isSaved: boolean;
}

export const sampleLawViewerLawId = "129AC0000000089";
export const offlineDemoLawId = "offline-demo";

const lawId = sampleLawViewerLawId;
const revisionId = "129AC0000000089_20260624_508AC0000000045";

const node = (overrides: Partial<LawNode> & Pick<LawNode, "id" | "path" | "type">): LawNode => ({
  lawId,
  revisionId,
  rawText: "",
  plainText: "",
  children: [],
  ...overrides,
});

export const sampleLawViewerDocument = {
  law: {
    lawId,
    title: "民法",
    lawNumber: "明治二十九年法律第八十九号",
    lawType: "法律",
    aliases: ["民法"],
    source: "egov",
  },
  revision: {
    lawId,
    revisionId,
    effectiveDate: "2026-06-24",
    fetchedAt: "2026-07-05T00:00:00.000Z",
  },
  nodes: [
    node({
      id: "part:1",
      type: "Part",
      path: "part:1",
      number: "1",
      title: "第一編　総則",
      children: ["chapter:1"],
    }),
    node({
      id: "chapter:1",
      type: "Chapter",
      path: "part:1/chapter:1",
      number: "1",
      title: "第一章　通則",
      children: ["article:1", "article:2"],
      parentId: "part:1",
    }),
    node({
      id: "article:1",
      type: "Article",
      path: "part:1/chapter:1/article:1",
      number: "1",
      title: "第一条",
      rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
      plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
      children: ["paragraph:1"],
      parentId: "chapter:1",
    }),
    node({
      id: "paragraph:1",
      type: "Paragraph",
      path: "part:1/chapter:1/article:1/paragraph:1",
      number: "1",
      rawText: "私権は、公共の福祉に適合しなければならない。",
      plainText: "私権は、公共の福祉に適合しなければならない。",
      parentId: "article:1",
    }),
    node({
      id: "article:2",
      type: "Article",
      path: "part:1/chapter:1/article:2",
      number: "2",
      title: "第二条",
      rawText:
        "第二条　この法律は、個人の尊厳と両性の本質的平等を旨として、解釈しなければならない。",
      plainText:
        "第二条 この法律は、個人の尊厳と両性の本質的平等を旨として、解釈しなければならない。",
      children: ["paragraph:2"],
      parentId: "chapter:1",
    }),
    node({
      id: "paragraph:2",
      type: "Paragraph",
      path: "part:1/chapter:1/article:2/paragraph:1",
      number: "1",
      rawText: "この法律は、個人の尊厳と両性の本質的平等を旨として、解釈しなければならない。",
      plainText: "この法律は、個人の尊厳と両性の本質的平等を旨として、解釈しなければならない。",
      parentId: "article:2",
    }),
  ],
  isSaved: false,
} satisfies LawViewerDocument;
