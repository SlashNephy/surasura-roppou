import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";

import { applyLawHeadingTextDisplayMode, type LawTextDisplayMode } from "./displayMode";
import type { LawTocItem } from "./lawToc";

interface LawTableOfContentsProps {
  items: LawTocItem[];
  activeArticleNumber?: string;
  displayMode?: LawTextDisplayMode;
  onSelectArticle: (articleNumber: string) => void;
}

export const LawTableOfContents = ({
  items,
  activeArticleNumber,
  displayMode = "readable",
  onSelectArticle,
}: LawTableOfContentsProps) => (
  <nav
    aria-label="法令目次"
    className={cn(
      "min-w-0",
      // 見やすい表示では目次でも CJK と半角英数の間に自動スペースを入れる。
      displayMode === "readable" ? "[text-autospace:normal]" : "[text-autospace:no-autospace]",
    )}
  >
    {items.length > 0 ? (
      <TocItemList
        activeArticleNumber={activeArticleNumber}
        displayMode={displayMode}
        items={items}
        onSelectArticle={onSelectArticle}
      />
    ) : (
      <p className="text-sm leading-display text-muted-foreground">目次を表示できません</p>
    )}
  </nav>
);

const TocItemList = ({
  items,
  activeArticleNumber,
  displayMode,
  onSelectArticle,
}: {
  items: LawTocItem[];
  activeArticleNumber?: string;
  displayMode: LawTextDisplayMode;
  onSelectArticle: (articleNumber: string) => void;
}) => (
  <ul className="grid min-w-0 gap-1">
    {items.map((item) => (
      <li key={item.id} className="min-w-0">
        <TocItem
          activeArticleNumber={activeArticleNumber}
          displayMode={displayMode}
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
  displayMode,
  onSelectArticle,
}: {
  item: LawTocItem;
  activeArticleNumber?: string;
  displayMode: LawTextDisplayMode;
  onSelectArticle: (articleNumber: string) => void;
}) => {
  const articleNumber = item.type === "Article" ? item.articleNumber : undefined;
  const isArticle = articleNumber !== undefined;
  const isActiveArticle = articleNumber === activeArticleNumber;
  const displayTitle = applyLawHeadingTextDisplayMode(item.title, displayMode);
  // 条見出し（例:「（親告罪）」）。条番号の隣に控えめに添える。
  const displayCaption =
    item.caption === undefined
      ? undefined
      : applyLawHeadingTextDisplayMode(item.caption, displayMode);

  return (
    <div className="grid min-w-0 gap-1">
      {isArticle ? (
        <Button
          aria-current={isActiveArticle ? "location" : undefined}
          className={cn(
            "h-auto min-w-0 justify-start rounded-none border-l-2 border-transparent px-2 py-1.5 text-left leading-display whitespace-normal",
            isActiveArticle && "border-primary bg-accent text-accent-foreground",
          )}
          onClick={() => {
            onSelectArticle(articleNumber);
          }}
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 font-serif break-words">
            {displayTitle}
            {/* 見出しは条番号より一段小さく（親フォントの約 2/3）控えめに見せる。 */}
            {displayCaption !== undefined ? (
              <span className="ml-1.5 text-[0.67em] font-normal text-muted-foreground">
                {displayCaption}
              </span>
            ) : null}
          </span>
        </Button>
      ) : (
        <span className="block min-w-0 px-2 py-1.5 font-serif text-sm leading-display font-medium text-foreground break-words">
          {displayTitle}
        </span>
      )}
      {item.children.length > 0 ? (
        <div className="ml-4 border-l pl-3">
          <TocItemList
            activeArticleNumber={activeArticleNumber}
            displayMode={displayMode}
            items={item.children}
            onSelectArticle={onSelectArticle}
          />
        </div>
      ) : null}
    </div>
  );
};
