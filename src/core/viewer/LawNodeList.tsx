import { useMemo } from "react";

import type { LawNode, LawNodeType } from "@/core/domain";
import { cn } from "@/shared/utils/cn";

interface LawNodeListProps {
  nodes: LawNode[];
}

type HeadingLawNodeType = Exclude<LawNodeType, "Article" | "Paragraph" | "Item" | "Subitem">;

const headingClassNameByType: Record<HeadingLawNodeType, string> = {
  Part: "text-xl font-semibold",
  Chapter: "text-lg font-semibold",
  Section: "text-base font-semibold",
  Subsection: "text-base font-semibold",
  Division: "text-base font-semibold",
  SupplementaryProvision: "text-lg font-semibold",
  AppdxTable: "text-lg font-semibold",
  AppdxStyle: "text-lg font-semibold",
};

type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6";

const headingTags: HeadingTag[] = ["h2", "h3", "h4", "h5", "h6"];

export const LawNodeList = ({ nodes }: LawNodeListProps) => {
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const topLevelNodes = useMemo(() => nodes.filter((node) => node.parentId === undefined), [nodes]);

  return (
    <div className="grid gap-5">
      {topLevelNodes.map((node) => (
        <LawNodeBlock key={node.id} depth={1} node={node} nodeById={nodeById} />
      ))}
    </div>
  );
};

const LawNodeBlock = ({
  depth,
  node,
  nodeById,
}: {
  depth: number;
  node: LawNode;
  nodeById: Map<string, LawNode>;
}) => {
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);
  const Heading = headingTags[Math.min(depth - 1, headingTags.length - 1)];

  switch (node.type) {
    case "Article":
      return (
        <article
          aria-label={node.title ?? `条文 ${node.number ?? node.path}`}
          className="rounded-md border bg-background p-4 shadow-xs md:p-5"
        >
          <Heading className="text-lg font-semibold text-foreground">
            {node.title ?? node.number}
          </Heading>
          <div className="mt-4 grid gap-3">
            {children.length > 0 ? (
              children.map((child) => (
                <LawNodeBlock key={child.id} depth={depth + 1} node={child} nodeById={nodeById} />
              ))
            ) : (
              <p className="leading-8 text-foreground break-words">{node.plainText}</p>
            )}
          </div>
        </article>
      );

    case "Paragraph":
    case "Item":
    case "Subitem": {
      const marker = node.type === "Paragraph" ? node.title : (node.title ?? node.number);
      const bodyText = stripLeadingMarker(
        stripTrailingChildPlainTexts(node.plainText, children),
        marker,
      );

      return (
        <div
          className={cn(
            "grid gap-2",
            node.type === "Item" && "pl-5",
            node.type === "Subitem" && "pl-8",
          )}
        >
          <p className="flex min-w-0 gap-3 leading-8 text-foreground">
            {marker !== undefined ? (
              <span className="shrink-0 text-muted-foreground">{marker}</span>
            ) : null}
            <span className="min-w-0 break-words">{bodyText}</span>
          </p>
          {children.map((child) => (
            <LawNodeBlock key={child.id} depth={depth + 1} node={child} nodeById={nodeById} />
          ))}
        </div>
      );
    }
  }

  const headingClassName = headingClassNameByType[node.type];
  const bodyText = stripTrailingChildPlainTexts(
    stripLeadingMarker(node.plainText, node.title),
    children,
  );

  return (
    <section className="grid gap-3">
      {node.title !== undefined ? (
        <Heading className={cn("text-foreground break-words", headingClassName)}>
          {node.title}
        </Heading>
      ) : null}
      {bodyText !== "" ? <p className="leading-8 text-foreground break-words">{bodyText}</p> : null}
      {children.map((child) => (
        <LawNodeBlock key={child.id} depth={depth + 1} node={child} nodeById={nodeById} />
      ))}
    </section>
  );
};

const stripTrailingChildPlainTexts = (plainText: string, children: LawNode[]): string =>
  children.reduceRight((bodyText, child) => {
    if (child.plainText === "") {
      return bodyText;
    }

    if (!bodyText.endsWith(child.plainText)) {
      return bodyText;
    }

    return bodyText.slice(0, -child.plainText.length).trim();
  }, plainText);

const stripLeadingMarker = (plainText: string, marker: string | undefined): string => {
  if (marker === undefined) {
    return plainText;
  }

  return plainText.startsWith(marker) ? plainText.slice(marker.length).trim() : plainText;
};
