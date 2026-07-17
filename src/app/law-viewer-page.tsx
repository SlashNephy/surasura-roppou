import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Clipboard, Download, LinkIcon, ListTree, Trash2 } from "lucide-react";

import type { LawNode, LawRevision } from "@/core/domain";
import { buildLawArticleUrl, computeArticleFingerprint } from "@/core/domain";
import { createEgovLawRepository } from "@/core/egov";
import type { LawRepository } from "@/core/egov";
import { resolveAsOf } from "@/core/settings";
import { createSavedLawUseCase, createStorageRepository, generateStorageId } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import {
  LawDocumentView,
  LawTableOfContents,
  articleAnchorId,
  buildArticleCopyText,
  buildLawTableOfContents,
  findArticleNode,
} from "@/core/viewer";
import type { LawTocItem } from "@/core/viewer";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { Skeleton } from "@/shared/ui/skeleton";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { AnchorCompareDialog } from "./AnchorCompareDialog";
import { QuizGenerateDialog } from "./QuizGenerateDialog";
import { StudyCardCreateDialog } from "./StudyCardCreateDialog";
import { AnchorDriftBadge } from "./AnchorDriftBadge";
import { loadLawViewerDocument } from "./law-viewer-loader";
import { useOnlineStatus, useSavedViewerState } from "./law-viewer-hooks";
import type { LawViewerDocument } from "./law-viewer-sample";
import { useAnchorVerification } from "./use-anchor-verification";
import { useBaseDate } from "./use-base-date";
import { useDisplayPreferences } from "./use-display-preferences";

const defaultStorageRepository = createStorageRepository();
const defaultLawRepository = createEgovLawRepository();

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
  const { baseDate } = useBaseDate();
  const asOf = resolveAsOf(baseDate);

  return (
    <LawViewerPageLoader
      key={lawId}
      activeArticleNumber={article}
      asOf={asOf}
      lawId={lawId}
      repository={repository}
      storageRepository={storageRepository}
    />
  );
};

const LawViewerPageLoader = ({
  activeArticleNumber,
  asOf,
  lawId,
  repository,
  storageRepository,
}: {
  activeArticleNumber?: string;
  asOf?: string;
  lawId: string;
  repository?: LawRepository;
  storageRepository: StorageRepository;
}) => {
  const [state, setState] = useState<LawViewerState>({ status: "loading" });

  useEffect(() => {
    let isCurrent = true;

    void loadLawViewerDocument(lawId, repository, storageRepository, asOf).then((nextState) => {
      if (isCurrent) {
        setState(nextState);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [asOf, lawId, repository, storageRepository]);

  return (
    <LawViewerPageContent
      activeArticleNumber={activeArticleNumber}
      lawId={lawId}
      repository={repository}
      state={state}
      storageRepository={storageRepository}
    />
  );
};

export const LawViewerPageContent = ({
  activeArticleNumber,
  lawId = "",
  repository,
  state,
  storageRepository = defaultStorageRepository,
}: {
  activeArticleNumber?: string;
  lawId?: string;
  repository?: LawRepository;
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
          repository={repository}
          state={state}
          storageRepository={storageRepository}
        />
      );
  }
};

const LawViewerReadyState = ({
  activeArticleNumber: routeArticleNumber,
  lawId,
  repository,
  state: baseState,
  storageRepository,
}: {
  activeArticleNumber?: string;
  lawId: string;
  repository?: LawRepository;
  state: Extract<LawViewerState, { status: "ready" }>;
  storageRepository: StorageRepository;
}) => {
  const navigate = useNavigate();
  const savedLawUseCase = useMemo(
    () => createSavedLawUseCase(storageRepository),
    [storageRepository],
  );
  const isOnline = useOnlineStatus();
  // 表示モードは設定（DisplayPreferences）で永続管理し、ビューワーは読むだけにする。
  const { textDisplayMode: displayMode } = useDisplayPreferences();
  const [savedState, setSavedState] = useSavedViewerState(baseState);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [copyError, setCopyError] = useState<string | undefined>();
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
  // モバイル用「この条文」シートの開閉状態。
  const [isArticleSheetOpen, setIsArticleSheetOpen] = useState(false);
  const [jumpArticleNumber, setJumpArticleNumber] = useState("");
  const [hasJumpError, setHasJumpError] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isCardDialogOpen, setIsCardDialogOpen] = useState(false);
  const [isQuizDialogOpen, setIsQuizDialogOpen] = useState(false);
  // 修復（付け替え・固定）後に加算し、アンカー検証を同一セッション内で再実行させるトークン。
  // putBookmark はフックの deps を変化させないため、このトークンで再読込を明示的に促す。
  const [anchorRefreshToken, setAnchorRefreshToken] = useState(0);
  const resolvedRepository = repository ?? defaultLawRepository;

  // アクティブ条のアンカー（指紋付きブックマーク）を基準日解決の本文に対して検証する。
  // pinned 判定はこの検証結果のブックマークから得るため、検証は基準日解決版に対して行う。
  const verification = useAnchorVerification({
    lawId,
    article: routeArticleNumber,
    nodes: baseState.nodes,
    storageRepository,
    refreshToken: anchorRefreshToken,
  });

  // pinned アンカーは基準日でなく revisionId で本文を固定解決する。
  // 検証結果（=ブックマーク）が pinned のとき、当該 revisionId で本文を再取得して差し替える。
  const pinnedRevisionId =
    verification?.bookmark.target.pinned === true
      ? (verification.bookmark.target.revisionId ?? undefined)
      : undefined;
  // 固定解決した本文を保持する。表示に使うのはこの結果が現在の pinnedRevisionId と
  // 一致するときだけで、不一致（pinned 解除・別条へ移動など）なら基準日解決版に戻す。
  const [pinnedState, setPinnedState] = useState<
    Extract<LawViewerState, { status: "ready" }> | undefined
  >(undefined);

  useEffect(() => {
    // 目的の固定版が無い、または基準日解決版が既に目的の版と一致するなら再取得しない
    // （後者は無限ループ回避の要）。この分岐では setState を呼ばず、表示側の派生で吸収する。
    if (pinnedRevisionId === undefined || baseState.revision.revisionId === pinnedRevisionId) {
      return;
    }

    let isCurrent = true;
    const run = async () => {
      try {
        const document = await resolvedRepository.getLaw(pinnedRevisionId);
        if (isCurrent) {
          setPinnedState({
            status: "ready",
            law: document.law,
            revision: document.revision,
            nodes: document.nodes,
            isSaved: baseState.isSaved,
            loadedFromStorage: false,
          });
        }
      } catch {
        // 固定解決に失敗した場合は基準日解決版のまま表示する。
      }
    };

    void run();

    return () => {
      isCurrent = false;
    };
  }, [pinnedRevisionId, resolvedRepository, baseState.revision.revisionId, baseState.isSaved]);

  // 実際に表示する状態。固定解決の結果が現在の目的版と一致するときだけ採用し、
  // それ以外（未解決・pinned 解除・別条移動）は基準日解決版を表示する。
  const state =
    pinnedRevisionId !== undefined && pinnedState?.revision.revisionId === pinnedRevisionId
      ? pinnedState
      : baseState;

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

  // 選択条が外れたらモバイルの「この条文」シートを閉じる。
  // 条件マウントで state が残り再 mount 時に勝手に開くのを、effect ではなくレンダー時同期で防ぐ。
  const [prevActiveArticleNumber, setPrevActiveArticleNumber] = useState(activeArticleNumber);
  if (activeArticleNumber !== prevActiveArticleNumber) {
    setPrevActiveArticleNumber(activeArticleNumber);
    if (activeArticleNumber === undefined) {
      setIsArticleSheetOpen(false);
    }
  }

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

  // アクティブ条の現在版に対して、指紋付きアンカー（ブックマーク）を作成して保存する。
  const handleSaveAnchor = async (articleNumber: string) => {
    const node = findArticleNode(state.nodes, articleNumber);
    if (node === undefined) {
      return;
    }

    setSaveError(undefined);
    try {
      const fingerprint = await computeArticleFingerprint(node.plainText);
      const now = new Date().toISOString();
      await storageRepository.putBookmark({
        id: generateStorageId(),
        target: {
          lawId,
          article: articleNumber,
          revisionId: state.revision.revisionId,
          fingerprint,
        },
        title: node.title ?? `第${articleNumber}条`,
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      setSaveError("この条文を保存できませんでした。端末の保存領域を確認してください。");
    }
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

  // 見比べダイアログが作成時版の本文を取得するためのローダー。ダイアログの effect が
  // これを deps に取るため、親の再描画で参照が変わると無駄な再取得を招く。useCallback で
  // 安定化し、依存するリポジトリと作成時版の revisionId が変わったときだけ作り直す。
  const compareRevisionId = verification?.bookmark.target.revisionId ?? "";
  const loadCreatedNodes = useCallback(
    async () => (await resolvedRepository.getLaw(compareRevisionId)).nodes,
    [resolvedRepository, compareRevisionId],
  );

  // カード作成ダイアログのアンカー対象ノード。アクティブ条が定まるときのみ描画する。
  const activeNode =
    activeArticleNumber !== undefined
      ? findArticleNode(state.nodes, activeArticleNumber)
      : undefined;

  // OCR 候補の「復習に追加」由来。study=new かつ対象条ノードが確定したら、
  // 一度だけカード作成ダイアログを自動起動し、リロード時の再起動を防ぐため param を消す。
  // study=new でなければガードを解除し、同一法令内の別条への再遷移でも
  // 自動起動できるようにする（param 消去後・別条遷移後に false へ戻る）。
  const articleSearch = useSearch({ from: "/laws/$lawId/articles/$article", shouldThrow: false });
  const cardAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (articleSearch?.study !== "new") {
      cardAutoOpenedRef.current = false;
      return;
    }

    if (
      activeNode === undefined ||
      activeArticleNumber === undefined ||
      cardAutoOpenedRef.current
    ) {
      return;
    }

    cardAutoOpenedRef.current = true;
    setIsCardDialogOpen(true);
    void navigate({
      to: "/laws/$lawId/articles/$article",
      params: { lawId, article: activeArticleNumber },
      search: {},
      replace: true,
    });
  }, [articleSearch?.study, activeNode, activeArticleNumber, lawId, navigate]);

  const notFoundAlert = (
    <p
      id={articleJumpErrorId}
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-display text-destructive"
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
              <p className="min-w-0 font-serif text-base leading-display font-semibold text-foreground break-words">
                {state.law.title}
              </p>
              {state.law.lawNumber !== undefined ? (
                <p className="min-w-0 text-xs leading-display text-muted-foreground break-words">
                  {state.law.lawNumber}
                </p>
              ) : null}
            </div>
            {savedState.isSaved ? (
              <Badge variant="secondary" className="w-fit">
                オフライン保存済み
              </Badge>
            ) : null}

            {/* 文書レベル操作: ジャンプ・オフライン保存・基準日 */}
            <div className="grid gap-3 border-b pb-3">
              <form className="grid gap-2" onSubmit={handleJumpSubmit}>
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
                <Button className="w-fit" type="submit">
                  移動
                </Button>
              </form>
              {hasArticleError ? notFoundAlert : null}
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
              <div aria-label="基準日情報" className="grid min-w-0 gap-1" role="group">
                <p className="text-sm leading-display text-muted-foreground">
                  基準日 {formatBaseDateLabel(state)} ・ 施行日{" "}
                  {formatEffectiveDateLabel(state.revision)}{" "}
                  <Link className="text-primary underline-offset-4 hover:underline" to="/settings">
                    設定で変更
                  </Link>
                </p>
              </div>
            </div>

            <p className="text-[0.625rem] font-medium tracking-widest text-muted-foreground">
              目次
            </p>
            <LawTableOfContents
              activeArticleNumber={activeArticleNumber}
              displayMode={displayMode}
              items={tocItems}
              onSelectArticle={navigateToArticle}
            />
          </div>
        </aside>

        <div className="min-w-0 px-4 py-6 md:px-8">
          {/* モバイル用サブバー（lg 以上は左右レールがあるため非表示） */}
          <div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
            <Button
              aria-controls={tocPanelId}
              aria-expanded={isMobileTocOpen}
              aria-haspopup="dialog"
              className="gap-2"
              onClick={() => {
                setIsMobileTocOpen(true);
              }}
              type="button"
              variant="outline"
            >
              <ListTree className="size-4" aria-hidden="true" />
              目次
            </Button>
            <Button
              className="gap-2"
              disabled={activeArticleNumber === undefined}
              onClick={() => {
                setIsArticleSheetOpen(true);
              }}
              type="button"
              variant="outline"
            >
              この条文
            </Button>
          </div>

          {saveError !== undefined ? (
            <p
              id={saveErrorId}
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-display text-destructive"
            >
              {saveError}
            </p>
          ) : null}

          {copyError !== undefined ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-display text-destructive"
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
              <span>保存日時: {formatIsoDateLabel(savedState.savedAt)}</span>
            ) : null}
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

          <p className="mt-6 border-t pt-4 text-xs leading-display text-muted-foreground">
            基準日 {formatBaseDateLabel(state)} ・ 施行日 {formatEffectiveDateLabel(state.revision)}{" "}
            ・ 取得日時 {formatIsoDateLabel(state.revision.fetchedAt)}
            {state.loadedFromStorage && state.requestedAsOf !== undefined
              ? "（保存版を表示中のため基準日は未反映）"
              : ""}
          </p>
        </div>

        <aside aria-label="学習コンテキスト" className="hidden border-l bg-muted/40 lg:block">
          <div className="sticky top-14 grid max-h-[calc(100dvh-3.5rem)] content-start gap-3 overflow-y-auto p-4 text-sm">
            <p className="text-xs text-muted-foreground">
              選択中:{" "}
              <span className="font-medium text-primary">
                {activeArticleNumber === undefined ? "なし" : `第${activeArticleNumber}条`}
              </span>
            </p>

            {/* 選択条レベル操作: 条が選択されているときのみ表示 */}
            {activeArticleNumber !== undefined ? (
              <div className="grid gap-2 border-b pb-3">
                <Button
                  className="w-full"
                  onClick={() => {
                    void handleSaveAnchor(activeArticleNumber);
                  }}
                  type="button"
                  variant="ghost"
                  aria-label="この条文を保存"
                >
                  この条文を保存
                </Button>
                {/* activeNode が undefined（条番号は分かるがノードが見つからない）ときは
                    ダイアログを開けないためボタンを非表示にする */}
                {activeNode !== undefined ? (
                  <>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setIsCardDialogOpen(true);
                      }}
                      type="button"
                      variant="ghost"
                    >
                      カードを作る
                    </Button>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setIsQuizDialogOpen(true);
                      }}
                      type="button"
                      variant="ghost"
                    >
                      クイズを生成
                    </Button>
                  </>
                ) : null}
                {verification !== undefined &&
                (verification.status !== "match" ||
                  verification.bookmark.target.pinned === true) ? (
                  <AnchorDriftBadge
                    status={verification.status === "not_found" ? "not_found" : "drift"}
                    onOpenCompare={() => {
                      setIsCompareOpen(true);
                    }}
                  />
                ) : null}
              </div>
            ) : (
              // 条が未選択のときは操作の代わりに案内文を表示する
              <p className="border-b pb-3 text-xs leading-display text-muted-foreground">
                条を選ぶと操作が表示されます
              </p>
            )}

            {(["メモ", "定義語", "関連条文", "復習カード"] as const).map((panelTitle) => (
              <section key={panelTitle} className="rounded-md border bg-card p-3">
                <h2 className="text-sm font-medium text-foreground">{panelTitle}</h2>
                <p className="mt-2 text-xs leading-display text-muted-foreground">準備中</p>
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

      {/* モバイル用目次シート（lg 未満でサブバーの「目次」ボタンから開く） */}
      <Sheet
        onOpenChange={(open) => {
          setIsMobileTocOpen(open);
          // シートを閉じたら一時的なジャンプ誤り表示をリセットする（再オープン時に古いエラーを出さない）。
          if (!open) {
            setHasJumpError(false);
          }
        }}
        open={isMobileTocOpen}
      >
        <SheetContent id={tocPanelId} side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>目次と操作</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 px-4 pb-4">
            {/* 条番号ジャンプ */}
            <form className="grid gap-2" onSubmit={handleJumpSubmit}>
              <label
                className="grid min-w-0 gap-1 text-sm font-medium text-foreground"
                htmlFor={`${articleInputId}-mobile`}
              >
                条番号
                <Input
                  aria-describedby={hasJumpError ? `${articleJumpErrorId}-mobile` : undefined}
                  aria-invalid={hasJumpError ? true : undefined}
                  autoComplete="off"
                  id={`${articleInputId}-mobile`}
                  name="article"
                  onChange={(event) => {
                    setJumpArticleNumber(event.target.value);
                    setHasJumpError(false);
                  }}
                  placeholder="例: 1"
                  value={jumpArticleNumber}
                />
              </label>
              <Button className="w-fit" type="submit">
                移動
              </Button>
            </form>
            {/* ジャンプ失敗エラー。左レールの notFoundAlert と同等だが id を分けて重複を回避する。 */}
            {hasArticleError ? (
              <p
                id={`${articleJumpErrorId}-mobile`}
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-display text-destructive"
              >
                指定された条文が見つかりません。
              </p>
            ) : null}
            {/* オフライン保存 */}
            <Button
              className="w-fit gap-2"
              disabled={isSaving}
              onClick={() => {
                void handleSaveToggle();
              }}
              type="button"
              variant={savedState.isSaved ? "outline" : "default"}
            >
              {savedState.isSaved ? "保存解除" : "オフライン保存"}
            </Button>
            {/* 基準日情報 */}
            <p className="text-sm leading-display text-muted-foreground">
              基準日 {formatBaseDateLabel(state)} ・ 施行日{" "}
              {formatEffectiveDateLabel(state.revision)}
            </p>
            <LawTableOfContents
              activeArticleNumber={activeArticleNumber}
              displayMode={displayMode}
              items={tocItems}
              onSelectArticle={navigateToArticle}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* モバイル用「この条文」シート（activeArticleNumber が定まるときのみ描画） */}
      {activeArticleNumber !== undefined ? (
        <Sheet onOpenChange={setIsArticleSheetOpen} open={isArticleSheetOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>第{activeArticleNumber}条の操作</SheetTitle>
            </SheetHeader>
            <div className="grid gap-2 px-4 pb-4">
              <Button
                className="w-full"
                onClick={() => {
                  void handleSaveAnchor(activeArticleNumber);
                  setIsArticleSheetOpen(false);
                }}
                type="button"
                variant="ghost"
                aria-label="この条文を保存"
              >
                この条文を保存
              </Button>
              {/* activeNode が undefined（条番号は分かるがノードが見つからない）ときは
                  ダイアログを開けないためボタンを非表示にする */}
              {activeNode !== undefined ? (
                <>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setIsArticleSheetOpen(false);
                      setIsCardDialogOpen(true);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    カードを作る
                  </Button>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setIsArticleSheetOpen(false);
                      setIsQuizDialogOpen(true);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    クイズを生成
                  </Button>
                </>
              ) : null}
              {/* モバイルでもアンカードリフトの比較・修復へ到達できるよう、デスクトップ右レールと
                  同等の AnchorDriftBadge をシート末尾に表示する。比較ダイアログはシート外の
                  既存コンポーネントが描画する。 */}
              {verification !== undefined &&
              (verification.status !== "match" || verification.bookmark.target.pinned === true) ? (
                <AnchorDriftBadge
                  status={verification.status === "not_found" ? "not_found" : "drift"}
                  onOpenCompare={() => {
                    setIsCompareOpen(true);
                  }}
                />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {isCompareOpen && verification !== undefined ? (
        <AnchorCompareDialog
          bookmark={verification.bookmark}
          status={verification.status}
          currentNodes={state.nodes}
          currentRevisionId={state.revision.revisionId}
          loadCreatedNodes={loadCreatedNodes}
          storageRepository={storageRepository}
          onRepaired={() => {
            setIsCompareOpen(false);
            setAnchorRefreshToken((n) => n + 1);
          }}
          onClose={() => {
            setIsCompareOpen(false);
          }}
        />
      ) : null}
      {activeNode !== undefined && activeArticleNumber !== undefined ? (
        <StudyCardCreateDialog
          articleNumber={activeArticleNumber}
          lawId={lawId}
          lawTitle={state.law.title}
          node={activeNode}
          onOpenChange={setIsCardDialogOpen}
          open={isCardDialogOpen}
          revisionId={state.revision.revisionId}
          storageRepository={storageRepository}
        />
      ) : null}
      {activeNode !== undefined && activeArticleNumber !== undefined ? (
        <QuizGenerateDialog
          articleNumber={activeArticleNumber}
          lawId={lawId}
          lawTitle={state.law.title}
          node={activeNode}
          nodes={state.nodes}
          onOpenChange={setIsQuizDialogOpen}
          open={isQuizDialogOpen}
          revisionId={state.revision.revisionId}
          storageRepository={storageRepository}
        />
      ) : null}
    </>
  );
};

const collectTocArticleNumbers = (items: LawTocItem[]): string[] =>
  items.flatMap((item) => [
    ...(item.articleNumber === undefined ? [] : [item.articleNumber]),
    ...collectTocArticleNumbers(item.children),
  ]);

// 表示に使った基準日のラベル。未設定なら現行法である旨を示す。
const formatBaseDateLabel = (state: Extract<LawViewerState, { status: "ready" }>): string =>
  state.requestedAsOf === undefined ? "未設定（現行法）" : formatIsoDateLabel(state.requestedAsOf);

// 解決版の施行日ラベル。未施行版など施行日が無い場合は「不明」にする。
const formatEffectiveDateLabel = (revision: LawRevision): string =>
  !revision.effectiveDate ? "不明" : `${formatIsoDateLabel(revision.effectiveDate)} 版`;

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
      <p className="text-base leading-display text-muted-foreground">{message}</p>
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
      <p className="text-sm leading-display font-medium text-primary">{lawTitle}</p>
      <h1 className="text-2xl font-semibold text-foreground">この法令は端末に保存されていません</h1>
      <p className="text-base leading-display text-muted-foreground">
        オフラインで表示するには、通信できる状態で法令本文を開いて保存してください。
      </p>
    </div>
    <Button asChild variant="outline" className="w-fit">
      <Link to="/laws">法令検索へ戻る</Link>
    </Button>
  </section>
);
