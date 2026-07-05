import type { LawNode, LawNodeType } from "@/core/domain";
import { cn } from "@/shared/utils/cn";

interface LawNodeListProps {
  nodes: LawNode[];
}

const headingClassNameByType = {
  Part: "text-xl font-semibold",
  Chapter: "text-lg font-semibold",
  Section: "text-base font-semibold",
  Subsection: "text-base font-semibold",
  Division: "text-base font-semibold",
  SupplementaryProvision: "text-lg font-semibold",
  AppdxTable: "text-lg font-semibold",
  AppdxStyle: "text-lg font-semibold",
} satisfies Partial<Record<LawNodeType, string>>;

export const LawNodeList = ({ nodes }: LawNodeListProps) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topLevelNodes = nodes.filter((node) => node.parentId === undefined);

  return (
    <div className="grid gap-5">
      {topLevelNodes.map((node) => (
        <LawNodeBlock key={node.id} node={node} nodeById={nodeById} />
      ))}
    </div>
  );
};

const LawNodeBlock = ({ node, nodeById }: { node: LawNode; nodeById: Map<string, LawNode> }) => {
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);

  if (node.type === "Article") {
    return (
      <article
        aria-label={node.title ?? `条文 ${node.number ?? node.path}`}
        className="rounded-md border bg-background p-4 shadow-xs md:p-5"
      >
        <h2 className="text-lg font-semibold text-foreground">{node.title ?? node.number}</h2>
        <div className="mt-4 grid gap-3">
          {children.length > 0 ? (
            children.map((child) => (
              <LawNodeBlock key={child.id} node={child} nodeById={nodeById} />
            ))
          ) : (
            <p className="leading-8 text-foreground break-words">{node.plainText}</p>
          )}
        </div>
      </article>
    );
  }

  if (node.type === "Paragraph" || node.type === "Item" || node.type === "Subitem") {
    const marker = node.title ?? node.number;
    const bodyText = stripLeadingMarker(stripChildPlainTexts(node.plainText, children), marker);

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
          <LawNodeBlock key={child.id} node={child} nodeById={nodeById} />
        ))}
      </div>
    );
  }

  const headingClassName = headingClassNameByType[node.type];
  const title = node.title ?? node.plainText;

  return (
    <section className="grid gap-3">
      {headingClassName !== undefined ? (
        <h2 className={cn("text-foreground break-words", headingClassName)}>{title}</h2>
      ) : null}
      {children.length === 0 && headingClassName === undefined ? (
        <p className="leading-8 text-foreground break-words">{node.plainText}</p>
      ) : null}
      {children.map((child) => (
        <LawNodeBlock key={child.id} node={child} nodeById={nodeById} />
      ))}
    </section>
  );
};

const stripChildPlainTexts = (plainText: string, children: LawNode[]): string =>
  children.reduce((bodyText, child) => bodyText.replace(child.plainText, "").trim(), plainText);

const stripLeadingMarker = (plainText: string, marker: string | undefined): string => {
  if (marker === undefined) {
    return plainText;
  }

  return plainText.startsWith(marker) ? plainText.slice(marker.length).trim() : plainText;
};
