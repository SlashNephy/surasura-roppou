import { type SyntheticEvent, useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Clipboard, Download, LinkIcon, ListTree, Trash2 } from "lucide-react";

import type { LawNode } from "@/core/domain";
import { buildLawArticleUrl } from "@/core/domain";
import type { LawRepository } from "@/core/egov";
import { createSavedLawUseCase, createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import {
  LawDocumentView,
  LawTableOfContents,
  articleAnchorId,
  buildArticleCopyText,
  buildLawTableOfContents,
} from "@/core/viewer";
import type { LawTextDisplayMode, LawTocItem } from "@/core/viewer";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { loadLawViewerDocument } from "./law-viewer-loader";
import { useOnlineStatus, useSavedViewerState } from "./law-viewer-hooks";
import type { LawViewerDocument } from "./law-viewer-sample";

const defaultStorageRepository = createStorageRepository();

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
  storageRepository?: StorageRepository;
}

export const LawViewerPage = ({
  repository,
  storageRepository = defaultStorageRepository,
}: LawViewerPageProps = {}) => {
  const { article, lawId } = useLawViewerParams();

  return (
    <LawViewerPageLoader
      key={lawId}
      activeArticleNumber={article}
      lawId={lawId}
      repository={repository}
      storageRepository={storageRepository}
    />
  );
};

const LawViewerPageLoader = ({
  activeArticleNumber,
  lawId,
  repository,
  storageRepository,
}: {
  activeArticleNumber?: string;
  lawId: string;
  repository?: LawRepository;
  storageRepository: StorageRepository;
}) => {
  const [state, setState] = useState<LawViewerState>({ status: "loading" });

  useEffect(() => {
    let isCurrent = true;

    void loadLawViewerDocument(lawId, repository, storageRepository).then((nextState) => {
      if (isCurrent) {
        setState(nextState);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [lawId, repository, storageRepository]);

  return (
    <LawViewerPageContent
      activeArticleNumber={activeArticleNumber}
      lawId={lawId}
      state={state}
      storageRepository={storageRepository}
    />
  );
};

export const LawViewerPageContent = ({
  activeArticleNumber,
  lawId = "",
  state,
  storageRepository = defaultStorageRepository,
}: {
  activeArticleNumber?: string;
  lawId?: string;
  state: LawViewerState;
  storageRepository?: StorageRepository;
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
          key={`${state.law.lawId}:${state.revision.revisionId}:${String(state.loadedFromStorage)}`}
          activeArticleNumber={activeArticleNumber}
          lawId={lawId}
          state={state}
          storageRepository={storageRepository}
        />
      );
  }
};

const LawViewerReadyState = ({
  activeArticleNumber: routeArticleNumber,
  lawId,
  state,
  storageRepository,
}: {
  activeArticleNumber?: string;
  lawId: string;
  state: Extract<LawViewerState, { status: "ready" }>;
  storageRepository: StorageRepository;
}) => {
  const navigate = useNavigate();
  const savedLawUseCase = useMemo(
    () => createSavedLawUseCase(storageRepository),
    [storageRepository],
  );
  const isOnline = useOnlineStatus();
  const [displayMode, setDisplayMode] = useState<LawTextDisplayMode>("readable");
  const [savedState, setSavedState] = useSavedViewerState(state);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [copyError, setCopyError] = useState<string | undefined>();
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
  const articleInputId = useId();
  const tocPanelId = "law-viewer-mobile-toc";
  const articleJumpErrorId = "article-jump-error";
  const saveErrorId = "offline-save-error";
  const hasArticleError = hasJumpError || !isRouteArticleKnown;

  useEffect(() => {
    if (copyError === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyError(undefined);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyError]);

  const handleArticleCopy = async (article: LawNode) => {
    setCopyError(undefined);

    const clipboard = getClipboard();

    if (clipboard === undefined) {
      setCopyError("コピー機能を利用できません。ブラウザの権限または接続方式を確認してください。");
      return;
    }

    try {
      await clipboard.writeText(
        buildArticleCopyText({
          article,
          baseUrl: window.location.origin,
          law: state.law,
          nodes: state.nodes,
        }),
      );
    } catch {
      setCopyError("コピー機能を利用できません。ブラウザの権限または接続方式を確認してください。");
    }
  };

  const handleArticleUrlCopy = async (article: LawNode) => {
    setCopyError(undefined);

    const clipboard = getClipboard();
    const url = new URL(
      buildLawArticleUrl({
        lawId: state.law.lawId,
        ...(article.number === undefined ? {} : { article: article.number }),
      }),
      window.location.origin,
    ).toString();

    try {
      if (clipboard === undefined) {
        throw new Error("Clipboard unavailable");
      }

      await clipboard.writeText(url);
    } catch {
      setCopyError("コピー機能を利用できません。ブラウザの権限または接続方式を確認してください。");
    } finally {
      if (article.number !== undefined) {
        navigateToArticle(article.number);
      }
    }
  };

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
      resetScroll: false,
    });
  };

  const handleSaveToggle = async () => {
    setIsSaving(true);
    setSaveError(undefined);

    try {
      if (savedState.isSaved) {
        await savedLawUseCase.remove(state.law.lawId);
        setSavedState({ isSaved: false, loadedFromStorage: false });
        return;
      }

      await savedLawUseCase.save({
        law: state.law,
        revision: state.revision,
        nodes: state.nodes,
      });

      const savedDocument = await savedLawUseCase.get(state.law.lawId);

      setSavedState({
        isSaved: true,
        loadedFromStorage: false,
        ...(savedDocument?.savedAt === undefined ? {} : { savedAt: savedDocument.savedAt }),
      });
    } catch {
      setSaveError("オフライン保存を更新できませんでした。端末の保存領域を確認してください。");
    } finally {
      setIsSaving(false);
    }
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
    <>
      <section className="mx-auto grid w-full max-w-7xl lg:grid-cols-[15rem_minmax(0,1fr)_16rem]">
        <aside aria-label="法令の目次" className="hidden border-r bg-muted/40 lg:block">
          <div className="sticky top-14 grid max-h-[calc(100dvh-3.5rem)] content-start gap-3 overflow-y-auto p-4">
            <div className="grid gap-1">
              <p className="min-w-0 font-serif text-base font-semibold text-foreground break-words">
                {state.law.title}
              </p>
              {state.law.lawNumber !== undefined ? (
                <p className="min-w-0 text-xs text-muted-foreground break-words">
                  {state.law.lawNumber}
                </p>
              ) : null}
            </div>
            {savedState.isSaved ? (
              <Badge variant="secondary" className="w-fit">
                オフライン保存済み
              </Badge>
            ) : null}
            <p className="text-[10px] font-medium tracking-widest text-muted-foreground">目次</p>
            <LawTableOfContents
              activeArticleNumber={activeArticleNumber}
              items={tocItems}
              onSelectArticle={navigateToArticle}
            />
          </div>
        </aside>

        <div className="min-w-0 px-4 py-6 md:px-8">
          <div className="mb-4 grid gap-3 rounded-md border bg-card p-3 text-card-foreground shadow-xs md:flex md:flex-wrap md:items-end">
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
              className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_auto]"
              onSubmit={handleJumpSubmit}
            >
              <label
                className="grid min-w-0 gap-1 text-sm font-medium text-foreground"
                htmlFor={articleInputId}
              >
                条番号
                <Input
                  aria-describedby={hasJumpError ? articleJumpErrorId : undefined}
                  aria-invalid={hasJumpError ? true : undefined}
                  autoComplete="off"
                  id={articleInputId}
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

            <div className="grid min-w-0 gap-2 md:ml-auto">
              <span className="text-sm font-medium text-foreground">オフライン</span>
              <Button
                aria-describedby={saveError === undefined ? undefined : saveErrorId}
                className="w-fit gap-2"
                disabled={isSaving}
                onClick={() => {
                  void handleSaveToggle();
                }}
                type="button"
                variant={savedState.isSaved ? "outline" : "default"}
              >
                {savedState.isSaved ? (
                  <Trash2 className="size-4" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
                {savedState.isSaved ? "保存解除" : "オフライン保存"}
              </Button>
            </div>

            {hasArticleError ? <div className="md:w-full">{notFoundAlert}</div> : null}
          </div>

          {saveError !== undefined ? (
            <p
              id={saveErrorId}
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
            >
              {saveError}
            </p>
          ) : null}

          {copyError !== undefined ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
            >
              {copyError}
            </p>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{isOnline ? "オンライン" : "オフライン"}</span>
            {savedState.loadedFromStorage ? (
              <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
                保存済み本文を表示中
              </span>
            ) : null}
            {savedState.savedAt !== undefined ? (
              <span>保存日時: {savedState.savedAt.slice(0, 10)}</span>
            ) : null}
          </div>

          <div
            id={tocPanelId}
            className="mb-4 rounded-md border bg-card p-3 shadow-xs lg:hidden"
            hidden={!isMobileTocOpen}
          >
            <LawTableOfContents
              activeArticleNumber={activeArticleNumber}
              items={tocItems}
              onSelectArticle={navigateToArticle}
            />
          </div>

          <LawDocumentView
            activeArticleNumber={activeArticleNumber}
            displayMode={displayMode}
            isSaved={savedState.isSaved}
            law={state.law}
            nodes={state.nodes}
            renderArticleActions={(article) => (
              <ArticleQuickActions
                article={article}
                onCopy={(copyTarget) => {
                  void handleArticleCopy(copyTarget);
                }}
                onUrlCopy={(copyTarget) => {
                  void handleArticleUrlCopy(copyTarget);
                }}
              />
            )}
            revision={state.revision}
          />
        </div>

        <aside aria-label="学習コンテキスト" className="hidden border-l bg-muted/40 lg:block">
          <div className="sticky top-14 grid max-h-[calc(100dvh-3.5rem)] content-start gap-3 overflow-y-auto p-4 text-sm">
            <p className="text-xs text-muted-foreground">
              選択中:{" "}
              <span className="font-medium text-primary">
                {activeArticleNumber === undefined ? "なし" : `第${activeArticleNumber}条`}
              </span>
            </p>
            {(["メモ", "定義語", "関連条文", "復習カード"] as const).map((panelTitle) => (
              <section key={panelTitle} className="rounded-md border bg-card p-3">
                <h2 className="text-sm font-medium text-foreground">{panelTitle}</h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">準備中</p>
              </section>
            ))}
            <div className="grid gap-2 border-t pt-3">
              <Button disabled type="button" className="w-full">
                復習カードを作る（準備中）
              </Button>
              <Button disabled type="button" variant="outline" className="w-full">
                ブックマーク（準備中）
              </Button>
            </div>
          </div>
        </aside>
      </section>

      <footer className="border-t bg-popover px-4 py-2 text-xs text-muted-foreground md:px-6">
        出典: e-Gov 法令検索 ・ 取得 {getDisplaySourceDate(state.revision.fetchedAt)} ・
        読みやすい表示は原文に表示上の加工を含みます（「原文表示」で確認できます）
      </footer>
    </>
  );
};

const collectTocArticleNumbers = (items: LawTocItem[]): string[] =>
  items.flatMap((item) => [
    ...(item.articleNumber === undefined ? [] : [item.articleNumber]),
    ...collectTocArticleNumbers(item.children),
  ]);

const normalizeArticleNumberInput = (articleNumber: string): string =>
  articleNumber.normalize("NFKC").replace(/\s+/g, "");

const getClipboard = (): Pick<Clipboard, "writeText"> | undefined =>
  (navigator as Navigator & { clipboard?: Pick<Clipboard, "writeText"> }).clipboard;

const ArticleQuickActions = ({
  article,
  onCopy,
  onUrlCopy,
}: {
  article: LawNode;
  onCopy: (article: LawNode) => void;
  onUrlCopy: (article: LawNode) => void;
}) => {
  const articleLabel = article.title ?? article.number ?? "条文";

  return (
    <>
      <Button
        aria-label={`${articleLabel}をコピー`}
        className="size-7 p-0 text-muted-foreground opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        onClick={() => {
          onCopy(article);
        }}
        title="コピー"
        type="button"
        variant="ghost"
      >
        <Clipboard className="size-4" aria-hidden="true" />
      </Button>
      <Button
        aria-label={`${articleLabel}のURLコピー`}
        className="size-7 p-0 text-muted-foreground opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        onClick={() => {
          onUrlCopy(article);
        }}
        title="URLコピー"
        type="button"
        variant="ghost"
      >
        <LinkIcon className="size-4" aria-hidden="true" />
      </Button>
    </>
  );
};

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

const getDisplaySourceDate = (fetchedAt: string): string => formatIsoDateLabel(fetchedAt);
