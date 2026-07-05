import { type SyntheticEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ListTree } from "lucide-react";

import type { LawRepository } from "@/core/egov";
import {
  LawDocumentView,
  LawTableOfContents,
  articleAnchorId,
  buildLawTableOfContents,
} from "@/core/viewer";
import type { LawTextDisplayMode, LawTocItem } from "@/core/viewer";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";

import { loadLawViewerDocument } from "./law-viewer-loader";
import type { LawViewerDocument } from "./law-viewer-sample";

export type LawViewerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "offline-unavailable"; lawTitle: string }
  | ({ status: "ready" } & LawViewerDocument);

const useLawViewerParams = () => {
  const baseParams = useParams({ from: "/laws/$lawId", shouldThrow: false });
  const articleParams = useParams({
    from: "/laws/$lawId/articles/$article",
    shouldThrow: false,
  });

  return {
    lawId: articleParams?.lawId ?? baseParams?.lawId ?? "",
    article: articleParams?.article,
  };
};

interface LawViewerPageProps {
  repository?: LawRepository;
}

export const LawViewerPage = ({ repository }: LawViewerPageProps = {}) => {
  const { article, lawId } = useLawViewerParams();

  return (
    <LawViewerPageLoader
      key={lawId}
      activeArticleNumber={article}
      lawId={lawId}
      repository={repository}
    />
  );
};

const LawViewerPageLoader = ({
  activeArticleNumber,
  lawId,
  repository,
}: {
  activeArticleNumber?: string;
  lawId: string;
  repository?: LawRepository;
}) => {
  const [state, setState] = useState<LawViewerState>({ status: "loading" });

  useEffect(() => {
    let isCurrent = true;

    void loadLawViewerDocument(lawId, repository).then((nextState) => {
      if (isCurrent) {
        setState(nextState);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [lawId, repository]);

  return (
    <LawViewerPageContent activeArticleNumber={activeArticleNumber} lawId={lawId} state={state} />
  );
};

export const LawViewerPageContent = ({
  activeArticleNumber,
  lawId = "",
  state,
}: {
  activeArticleNumber?: string;
  lawId?: string;
  state: LawViewerState;
}) => {
  switch (state.status) {
    case "loading":
      return <LawViewerLoadingState />;

    case "error":
      return <LawViewerErrorState message={state.message} />;

    case "offline-unavailable":
      return <LawViewerOfflineState lawTitle={state.lawTitle} />;

    case "ready":
      return (
        <LawViewerReadyState
          activeArticleNumber={activeArticleNumber}
          lawId={lawId}
          state={state}
        />
      );
  }
};

const LawViewerReadyState = ({
  activeArticleNumber: routeArticleNumber,
  lawId,
  state,
}: {
  activeArticleNumber?: string;
  lawId: string;
  state: Extract<LawViewerState, { status: "ready" }>;
}) => {
  const navigate = useNavigate();
  const [displayMode, setDisplayMode] = useState<LawTextDisplayMode>("readable");
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
  const [jumpArticleNumber, setJumpArticleNumber] = useState("");
  const [hasJumpError, setHasJumpError] = useState(false);
  const tocItems = useMemo(() => buildLawTableOfContents(state.nodes), [state.nodes]);
  const articleNumbers = useMemo(() => new Set(collectTocArticleNumbers(tocItems)), [tocItems]);
  const articleNumberByNormalizedInput = useMemo(
    () =>
      new Map(
        collectTocArticleNumbers(tocItems).map((articleNumber) => [
          normalizeArticleNumberInput(articleNumber),
          articleNumber,
        ]),
      ),
    [tocItems],
  );
  const isRouteArticleKnown =
    routeArticleNumber === undefined || articleNumbers.has(routeArticleNumber);
  const activeArticleNumber = isRouteArticleKnown ? routeArticleNumber : undefined;
  const tocPanelId = "law-viewer-mobile-toc";
  const articleJumpErrorId = "article-jump-error";
  const hasArticleError = hasJumpError || !isRouteArticleKnown;

  const scrollToArticle = (articleNumber: string) => {
    document
      .getElementById(articleAnchorId(articleNumber))
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  useEffect(() => {
    if (activeArticleNumber === undefined) {
      return;
    }

    scrollToArticle(activeArticleNumber);
  }, [activeArticleNumber]);

  const navigateToArticle = (articleNumber: string) => {
    setHasJumpError(false);
    setIsMobileTocOpen(false);

    if (articleNumber === activeArticleNumber) {
      scrollToArticle(articleNumber);
    }

    void navigate({
      to: "/laws/$lawId/articles/$article",
      params: { lawId, article: articleNumber },
    });
  };

  const handleJumpSubmit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();

    const normalizedArticleNumber = normalizeArticleNumberInput(jumpArticleNumber);
    if (normalizedArticleNumber === "") {
      return;
    }

    const nextArticleNumber = articleNumberByNormalizedInput.get(normalizedArticleNumber);
    if (nextArticleNumber === undefined) {
      setHasJumpError(true);
      return;
    }

    navigateToArticle(nextArticleNumber);
  };

  const notFoundAlert = (
    <p
      id={articleJumpErrorId}
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
    >
      指定された条文が見つかりません。
    </p>
  );

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 md:px-6 md:py-8">
      <div className="grid gap-4 rounded-md border bg-card p-4 text-card-foreground shadow-xs md:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] md:items-end">
        <div className="grid min-w-0 gap-2">
          <span className="text-sm font-medium text-foreground">表示</span>
          <div
            aria-label="表示モード"
            className="inline-flex w-fit rounded-md border bg-background p-1"
            role="group"
          >
            <Button
              aria-pressed={displayMode === "readable"}
              className="h-8 px-3"
              onClick={() => {
                setDisplayMode("readable");
              }}
              type="button"
              variant={displayMode === "readable" ? "default" : "ghost"}
            >
              読みやすい表示
            </Button>
            <Button
              aria-pressed={displayMode === "original"}
              className="h-8 px-3"
              onClick={() => {
                setDisplayMode("original");
              }}
              type="button"
              variant={displayMode === "original" ? "default" : "ghost"}
            >
              原文表示
            </Button>
          </div>
        </div>

        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto]"
          onSubmit={handleJumpSubmit}
        >
          <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
            条番号
            <Input
              aria-describedby={hasJumpError ? articleJumpErrorId : undefined}
              aria-invalid={hasJumpError ? true : undefined}
              autoComplete="off"
              name="article"
              onChange={(event) => {
                setJumpArticleNumber(event.target.value);
                setHasJumpError(false);
              }}
              placeholder="例: 1"
              value={jumpArticleNumber}
            />
          </label>
          <Button className="w-fit self-end" type="submit">
            移動
          </Button>
        </form>

        <Button
          aria-controls={tocPanelId}
          aria-expanded={isMobileTocOpen}
          className="w-fit gap-2 lg:hidden"
          onClick={() => {
            setIsMobileTocOpen((current) => !current);
          }}
          type="button"
          variant="outline"
        >
          <ListTree className="size-4" />
          目次
        </Button>

        {hasArticleError ? <div className="md:col-span-full">{notFoundAlert}</div> : null}
      </div>

      <div
        id={tocPanelId}
        className="rounded-md border bg-card p-3 shadow-xs lg:hidden"
        hidden={!isMobileTocOpen}
      >
        <LawTableOfContents
          activeArticleNumber={activeArticleNumber}
          items={tocItems}
          onSelectArticle={navigateToArticle}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <aside className="hidden rounded-md border bg-card p-3 shadow-xs lg:block">
          <LawTableOfContents
            activeArticleNumber={activeArticleNumber}
            items={tocItems}
            onSelectArticle={navigateToArticle}
          />
        </aside>
        <LawDocumentView
          activeArticleNumber={activeArticleNumber}
          displayMode={displayMode}
          isSaved={state.isSaved}
          law={state.law}
          nodes={state.nodes}
          revision={state.revision}
        />
      </div>
    </section>
  );
};

const collectTocArticleNumbers = (items: LawTocItem[]): string[] =>
  items.flatMap((item) => [
    ...(item.articleNumber === undefined ? [] : [item.articleNumber]),
    ...collectTocArticleNumbers(item.children),
  ]);

const normalizeArticleNumberInput = (articleNumber: string): string =>
  articleNumber.normalize("NFKC").replace(/\s+/g, "");

const LawViewerLoadingState = () => (
  <section
    aria-label="法令本文を読み込み中"
    className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 md:px-6 md:py-8"
  >
    <div className="grid gap-3 border-b pb-5">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-9 w-full max-w-80" />
      <Skeleton className="h-5 w-full max-w-56" />
    </div>
    <div className="grid gap-4">
      <Skeleton className="h-8 w-full max-w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  </section>
);

const LawViewerErrorState = ({ message }: { message: string }) => (
  <section
    role="alert"
    className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10 md:px-6"
  >
    <div className="grid gap-2">
      <h1 className="text-2xl font-semibold text-foreground">法令を表示できません</h1>
      <p className="text-base leading-7 text-muted-foreground">{message}</p>
    </div>
    <Button asChild className="w-fit">
      <Link to="/laws">法令検索へ戻る</Link>
    </Button>
  </section>
);

const LawViewerOfflineState = ({ lawTitle }: { lawTitle: string }) => (
  <section
    role="status"
    className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10 md:px-6"
  >
    <div className="grid gap-2">
      <p className="text-sm font-medium text-primary">{lawTitle}</p>
      <h1 className="text-2xl font-semibold text-foreground">この法令は端末に保存されていません</h1>
      <p className="text-base leading-7 text-muted-foreground">
        オフラインで表示するには、通信できる状態で法令本文を開いて保存してください。
      </p>
    </div>
    <Button asChild variant="outline" className="w-fit">
      <Link to="/laws">法令検索へ戻る</Link>
    </Button>
  </section>
);
