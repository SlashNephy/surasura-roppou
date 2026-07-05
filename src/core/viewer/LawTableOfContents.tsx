import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";

import type { LawTocItem } from "./lawToc";

interface LawTableOfContentsProps {
  items: LawTocItem[];
  activeArticleNumber?: string;
  onSelectArticle: (articleNumber: string) => void;
}

export const LawTableOfContents = ({
  items,
  activeArticleNumber,
  onSelectArticle,
}: LawTableOfContentsProps) => (
  <nav aria-label="法令目次" className="min-w-0">
    {items.length > 0 ? (
      <TocItemList
        activeArticleNumber={activeArticleNumber}
        items={items}
        onSelectArticle={onSelectArticle}
      />
    ) : (
      <p className="text-sm text-muted-foreground">目次を表示できません</p>
    )}
  </nav>
);

const TocItemList = ({
  items,
  activeArticleNumber,
  onSelectArticle,
}: {
  items: LawTocItem[];
  activeArticleNumber?: string;
  onSelectArticle: (articleNumber: string) => void;
}) => (
  <ul className="grid min-w-0 gap-1">
    {items.map((item) => (
      <li key={item.id} className="min-w-0">
        <TocItem
          activeArticleNumber={activeArticleNumber}
          item={item}
          onSelectArticle={onSelectArticle}
        />
      </li>
    ))}
  </ul>
);

const TocItem = ({
  item,
  activeArticleNumber,
  onSelectArticle,
}: {
  item: LawTocItem;
  activeArticleNumber?: string;
  onSelectArticle: (articleNumber: string) => void;
}) => {
  const articleNumber = item.type === "Article" ? item.articleNumber : undefined;
  const isArticle = articleNumber !== undefined;
  const isActiveArticle = articleNumber === activeArticleNumber;

  return (
    <div className="grid min-w-0 gap-1">
      {isArticle ? (
        <Button
          aria-current={isActiveArticle ? "location" : undefined}
          className={cn(
            "h-auto min-w-0 justify-start px-2 py-1.5 text-left whitespace-normal",
            isActiveArticle && "bg-accent text-accent-foreground",
          )}
          onClick={() => {
            onSelectArticle(articleNumber);
          }}
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 break-words">{item.title}</span>
        </Button>
      ) : (
        <span className="block min-w-0 px-2 py-1.5 text-sm font-medium text-foreground break-words">
          {item.title}
        </span>
      )}
      {item.children.length > 0 ? (
        <div className="ml-4 border-l pl-3">
          <TocItemList
            activeArticleNumber={activeArticleNumber}
            items={item.children}
            onSelectArticle={onSelectArticle}
          />
        </div>
      ) : null}
    </div>
  );
};
