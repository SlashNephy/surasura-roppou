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
import { CircleCheck, Clipboard, Download, LinkIcon, ListTree } from "lucide-react";

import type { HighlightColor, LawNode, LawRevision } from "@/core/domain";
import { buildLawArticleUrl, computeArticleFingerprint } from "@/core/domain";
import { createEgovLawRepository } from "@/core/egov";
import type { LawRepository } from "@/core/egov";
import { resolveAsOf } from "@/core/settings";
import {
  createSavedLawUseCase,
  createStorageRepository,
  generateStorageId,
  hasRequestedPersistence,
  markPersistenceRequested,
  requestStoragePersistence,
} from "@/core/storage";
import type { SavedLawUseCase, StorageRepository } from "@/core/storage";
import {
  HighlightColorPopover,
  LawDocumentView,
  LawTableOfContents,
  alignTexts,
  applyLawTextDisplayMode,
  articleAnchorId,
  buildArticleCopyText,
  buildLawTableOfContents,
  caretPositionAt,
  displayTextOf,
  findArticleNode,
  findLawNodeElement,
  highlightPopoverAttribute,
  isHighlightSupported,
  resolveNodeTextRange,
  toSourceOffset,
} from "@/core/viewer";
import type { LawTocItem } from "@/core/viewer";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/utils/cn";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { AnchorCompareDialog } from "./AnchorCompareDialog";
import { QuizGenerateDialog } from "./QuizGenerateDialog";
import { StudyCardCreateDialog } from "./StudyCardCreateDialog";
import { AnchorDriftBadge } from "./AnchorDriftBadge";
import { useDocumentTitle } from "./document-title";
import { loadLawViewerDocument } from "./law-viewer-loader";
import { useRestoredReadingPosition } from "./scroll-restoration";
import { useSavedViewerState } from "./law-viewer-hooks";
import type { LawViewerDocument } from "./law-viewer-sample";
import { useAnchorVerification } from "./use-anchor-verification";
import { useArticleHighlights } from "./use-article-highlights";
import { useHighlightPainting } from "./use-highlight-painting";
import { useBaseDate } from "./use-base-date";
import { useDisplayPreferences } from "./use-display-preferences";
import { getCurrentStorageLimitBytes } from "./use-storage-limit";

const defaultStorageRepository = createStorageRepository();
const defaultLawRepository = createEgovLawRepository();

export type LawViewerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "offline-unavailable"; lawTitle: string }
  | ({ status: "ready" } & LawViewerDocument);

// 現行版スロットへ保存してよいか。基準日未指定の表示に加え、基準日時点に版が無く現行法へ
// 落ちた表示も実体は現行版なので、現行版として保存する。
const isCurrentRevisionDocument = (document: LawViewerDocument): boolean =>
  document.requestedAsOf === undefined || document.baseDateFallback === true;

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
  // 本文を取得できるまでは中間状態の文言を出さず、アプリ名だけを表示する。
  useDocumentTitle(state.status === "ready" ? state.law.title : undefined);
  // 上限は useMemo の依存に入れない。依存に入れると上限変更のたびに参照が変わり、
  // 下の読み込み effect（deps に savedLawUseCase を持つ）まで再実行されてしまう
  // （e-Gov への不要な再取得を誘発する）。getStorageLimitBytes は呼ばれるたびに
  // 評価される契約なので、クロージャで都度ストアを読めば参照の同一性を保ったまま最新値を使える。
  const savedLawUseCase = useMemo(
    () =>
      createSavedLawUseCase(storageRepository, {
        getStorageLimitBytes: getCurrentStorageLimitBytes,
      }),
    [storageRepository],
  );

  useEffect(() => {
    let isCurrent = true;

    void loadLawViewerDocument(lawId, repository, storageRepository, asOf).then((nextState) => {
      if (!isCurrent) {
        return;
      }

      setState(nextState);

      // 表示できた本文だけを保存する。保存済みの本文をそのまま出しただけのフォールバックは書き戻さない。
      // オフラインデモ法令は status が "offline-unavailable" になるため、この分岐で同時に除外される。
      if (nextState.status !== "ready" || nextState.loadedFromStorage) {
        return;
      }

      // 自動保存は表示をブロックしない。失敗しても閲覧を妨げないので握りつぶす。
      void savedLawUseCase
        .save(
          { law: nextState.law, revision: nextState.revision, nodes: nextState.nodes },
          // 基準日を指定して開いた版は現行版スロットを奪わない。基準日時点に版が無く
          // 現行法へ落ちた表示は現行版として保存する。
          { isCurrent: isCurrentRevisionDocument(nextState) },
        )
        .catch(() => undefined);
    });

    return () => {
      isCurrent = false;
    };
  }, [asOf, lawId, repository, savedLawUseCase, storageRepository]);

  return (
    <LawViewerPageContent
      activeArticleNumber={activeArticleNumber}
      lawId={lawId}
      repository={repository}
      savedLawUseCase={savedLawUseCase}
      state={state}
      storageRepository={storageRepository}
    />
  );
};

export const LawViewerPageContent = ({
  activeArticleNumber,
  lawId = "",
  repository,
  savedLawUseCase,
  state,
  storageRepository = defaultStorageRepository,
}: {
  activeArticleNumber?: string;
  lawId?: string;
  repository?: LawRepository;
  savedLawUseCase: SavedLawUseCase;
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
          savedLawUseCase={savedLawUseCase}
          state={state}
          storageRepository={storageRepository}
        />
      );
  }
};

interface HighlightPopoverState {
  anchorRect: { top: number; bottom: number; left: number; width: number };
  lawNodeId: string;
  range: { start: number; end: number };
  annotationId?: string;
  color?: HighlightColor;
  // キーボードで選択したときだけ最初の色へフォーカスを移す。ポインタ操作で移すと
  // 本文の選択が解除され、続けて選び直せなくなる。
  autoFocus?: boolean;
}

// 本文ノードから親をたどって、それが属する条の番号を求める。
// targetKey の索引に条番号が要るため、ハイライト保存時に載せる。
const findArticleNumberForNode = (nodes: LawNode[], lawNodeId: string): string | undefined => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let current = nodeById.get(lawNodeId);

  while (current !== undefined) {
    if (current.type === "Article") {
      return current.number;
    }

    current = current.parentId === undefined ? undefined : nodeById.get(current.parentId);
  }

  return undefined;
};

const LawViewerReadyState = ({
  activeArticleNumber: routeArticleNumber,
  lawId,
  repository,
  savedLawUseCase,
  state: baseState,
  storageRepository,
}: {
  activeArticleNumber?: string;
  lawId: string;
  repository?: LawRepository;
  savedLawUseCase: SavedLawUseCase;
  state: Extract<LawViewerState, { status: "ready" }>;
  storageRepository: StorageRepository;
}) => {
  const navigate = useNavigate();
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
            isPinned: baseState.isPinned,
            loadedFromStorage: false,
          });

          // 固定解決した過去版も開いた版として保存する。現行版スロットは奪わない。
          void savedLawUseCase
            .save(
              { law: document.law, revision: document.revision, nodes: document.nodes },
              { isCurrent: false },
            )
            .catch(() => undefined);
        }
      } catch {
        // 固定解決に失敗した場合は基準日解決版のまま表示する。
      }
    };

    void run();

    return () => {
      isCurrent = false;
    };
  }, [
    pinnedRevisionId,
    resolvedRepository,
    baseState.revision.revisionId,
    baseState.isPinned,
    savedLawUseCase,
  ]);

  // 実際に表示する状態。固定解決の結果が現在の目的版と一致するときだけ採用し、
  // それ以外（未解決・pinned 解除・別条移動）は基準日解決版を表示する。
  const state =
    pinnedRevisionId !== undefined && pinnedState?.revision.revisionId === pinnedRevisionId
      ? pinnedState
      : baseState;

  // ハイライト（条文の着色）。CSS Custom Highlight API 非対応の環境では丸ごと無効にする。
  const documentRef = useRef<HTMLDivElement>(null);
  const isHighlightEnabled = useMemo(() => isHighlightSupported(), []);
  const { annotations, highlight, remove } = useArticleHighlights({
    lawId: state.law.lawId,
    nodes: state.nodes,
    repository: storageRepository,
    enabled: isHighlightEnabled,
  });
  const paintedRangesRef = useHighlightPainting({
    containerRef: documentRef,
    nodes: state.nodes,
    annotations,
    enabled: isHighlightEnabled,
  });
  const [popover, setPopover] = useState<HighlightPopoverState | undefined>(undefined);

  useEffect(() => {
    if (!isHighlightEnabled) {
      return;
    }

    // 生きている選択からポップアップの状態を作る。選択が無ければ undefined。
    const popoverFromSelection = (): HighlightPopoverState | undefined => {
      const selection = window.getSelection();

      if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
        return undefined;
      }

      const range = selection.getRangeAt(0);
      const resolved = resolveNodeTextRange(range);

      if (resolved === undefined) {
        return undefined;
      }

      const rect = range.getBoundingClientRect();

      return {
        anchorRect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        lawNodeId: resolved.lawNodeId,
        range: { start: resolved.start, end: resolved.end },
      };
    };

    // 座標に既存のハイライトがあれば、その色と注釈 id を載せたポップアップを作る。
    const popoverFromPoint = (x: number, y: number): HighlightPopoverState | undefined => {
      const position = caretPositionAt(document, x, y);

      if (position === undefined) {
        return undefined;
      }

      const hit = paintedRangesRef.current.find((painted) =>
        painted.range.isPointInRange(position.node, position.offset),
      );

      if (hit === undefined) {
        return undefined;
      }

      const resolved = resolveNodeTextRange(hit.range);

      if (resolved === undefined) {
        return undefined;
      }

      const rect = hit.range.getBoundingClientRect();

      return {
        anchorRect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        lawNodeId: resolved.lawNodeId,
        range: { start: resolved.start, end: resolved.end },
        annotationId: hit.annotationId,
        color: hit.color,
      };
    };

    // 選択の途中（selectionchange）ではなく、選択が確定してから出す。
    // ドラッグ中に出すと、ポップアップの出現に伴う再レンダーとフォーカス移動で
    // ドラッグそのものが途切れ、途中までしか選べなくなる。
    const handlePointerUp = (event: PointerEvent) => {
      // ポップアップ自身の操作は無視する。ここで閉じると、色を押した click が届く前に
      // ボタンごと消えてしまう。
      if (
        event.target instanceof Element &&
        event.target.closest(`[${highlightPopoverAttribute}]`) !== null
      ) {
        return;
      }

      setPopover(popoverFromSelection() ?? popoverFromPoint(event.clientX, event.clientY));
    };

    // キーボード操作（Shift + 矢印）での選択にも追随する。
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.shiftKey) {
        return;
      }

      const next = popoverFromSelection();

      if (next !== undefined) {
        setPopover({ ...next, autoFocus: true });
      }
    };

    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [isHighlightEnabled, paintedRangesRef]);

  // ポップアップが持つ範囲は表示文字列（display 空間）の座標なので、保存前に
  // plainText 空間へ戻す。対応が取れないときは保存しない（本文全体を引用文にした
  // アンカーを黙って書き込む事故を防ぐ）。
  const highlightSelection = useCallback(
    (target: HighlightPopoverState, color: HighlightColor) => {
      const root = documentRef.current;
      const node = state.nodes.find((candidate) => candidate.id === target.lawNodeId);

      if (root === null || node === undefined) {
        return;
      }

      const element = findLawNodeElement(root, node.id);

      if (element === undefined) {
        return;
      }

      const alignment = alignTexts(node.plainText, displayTextOf(element));
      const start = toSourceOffset(alignment, target.range.start, "start");
      const end = toSourceOffset(alignment, target.range.end, "end");

      if (start === undefined || end === undefined || start >= end) {
        return;
      }

      void highlight({
        lawNodeId: target.lawNodeId,
        range: { start, end },
        color,
        target: {
          lawId: state.law.lawId,
          revisionId: state.revision.revisionId,
          article: findArticleNumberForNode(state.nodes, target.lawNodeId),
        },
      });
    },
    [highlight, state.law.lawId, state.nodes, state.revision.revisionId],
  );

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

  // 選択条が変わったらモバイルの「この条文」シートを閉じる。条→条の直接遷移でも、
  // 前の条のつもりで開いたシートが別の条の操作に化けたまま残るのを防ぐ（誤操作回避）。
  // effect ではなくレンダー時同期で行う（条件マウントで残った state の再 mount 時暴発も防ぐ）。
  const [prevActiveArticleNumber, setPrevActiveArticleNumber] = useState(activeArticleNumber);
  if (activeArticleNumber !== prevActiveArticleNumber) {
    setPrevActiveArticleNumber(activeArticleNumber);
    setIsArticleSheetOpen(false);
  }

  // 本文がマウントされたこの時点で、タブを離れる前の読書位置を当て直す。
  const hasRestoredReadingPosition = useRestoredReadingPosition();
  const [mountedArticleNumber] = useState(activeArticleNumber);

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

    // タブから戻って読書位置を復元したときは、条文の先頭へ引き戻さない。
    // 復元対象はマウント時の条だけで、条を移動したあとは通常どおりジャンプする。
    if (hasRestoredReadingPosition && activeArticleNumber === mountedArticleNumber) {
      return;
    }

    scrollToArticle(activeArticleNumber);
  }, [activeArticleNumber, hasRestoredReadingPosition, mountedArticleNumber]);

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

  // 法令を開くと自動保存が走るため、「保存済み」は常に真になり情報量を失った。
  // 代わりにユーザーの明示的な意図である「ダウンロード」（内部識別子は pin のまま。
  // PR 3 の自動削除対象外の印）を扱う。
  const handleLawPinToggle = async () => {
    setIsSaving(true);
    setSaveError(undefined);

    try {
      if (savedState.isPinned) {
        await savedLawUseCase.unpin(state.law.lawId);
        // await をまたぐため、閉じ込めた savedState ではなく最新値から更新する。
        setSavedState((previous) => ({ ...previous, isPinned: false }));
        return;
      }

      // 本文の無いピンを作らないよう、保存に成功してからピンを立てる（pin の契約）。
      // 自動保存と同じ判断で isCurrent を渡す。表示中が pinnedState（版固定で解決した過去版）
      // なら false、baseState でも基準日を指定した版がそのまま解決できていれば false にする
      // （基準日時点に版が無く現行法へ落ちた表示は現行版として扱う）。pinnedState は
      // requestedAsOf を持たないため、state === baseState の判定を先に見る必要がある。
      await savedLawUseCase.pin(
        {
          law: state.law,
          revision: state.revision,
          nodes: state.nodes,
        },
        { isCurrent: state === baseState && isCurrentRevisionDocument(baseState) },
      );
      setSavedState((previous) => ({ ...previous, isPinned: true }));

      // ダウンロードは「これを残しておきたい」という最も明確な意思表示であり、
      // Firefox のプロンプトが出ても文脈が通る唯一の瞬間。以後は設定画面に委ねる。
      if (!hasRequestedPersistence()) {
        markPersistenceRequested();
        void requestStoragePersistence();
      }
    } catch {
      // 解除の失敗は保存領域の空きと無関係（pinnedLaws からの削除は本文を書かない）なので、
      // ダウンロードと取り消しでメッセージを分け、ユーザーを誤誘導しないようにする。
      setSaveError(
        savedState.isPinned
          ? "ダウンロードを取り消せませんでした。時間をおいて再試行してください。"
          : "ダウンロードできませんでした。端末の保存領域を確認してください。",
      );
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
      <section className="mx-auto grid w-full max-w-[88rem] lg:grid-cols-[18rem_minmax(0,1fr)_16rem]">
        <aside aria-label="法令の目次" className="hidden border-r bg-muted/40 lg:block">
          <div className="sticky top-14 grid max-h-[calc(100dvh-3.5rem)] content-start gap-3 overflow-y-auto p-4">
            <div className="grid gap-1">
              <p className="min-w-0 font-law text-base leading-display font-semibold text-foreground break-words">
                {state.law.title}
              </p>
              {state.law.lawNumber !== undefined ? (
                <p className="min-w-0 text-xs leading-display text-muted-foreground break-words">
                  {applyLawTextDisplayMode(state.law.lawNumber, displayMode, "law-number")}
                </p>
              ) : null}
              {/* 基準日情報は法令番号の直下に置く。基準日が未設定（現行法）のときは
                  「基準日 未設定」を出さず施行日だけにする。変更は設定画面から行う。 */}
              <div
                aria-label="基準日情報"
                className="min-w-0 text-xs leading-display text-muted-foreground"
                role="group"
              >
                {formatBaseDatePrefix(state)}
                施行日 {formatEffectiveDateLabel(state.revision)}
              </div>
            </div>
            {/* 文書レベル操作: ダウンロード（基準日は法令番号の直下、条番号ジャンプは目次直下に置く） */}
            <div className="grid gap-3 border-b pb-3">
              <Button
                aria-describedby={saveError === undefined ? undefined : saveErrorId}
                // 済みの状態は既存の主色で示す。このテーマの --primary は #166534
                // （ダークは #4ade80）で既に緑なので、成功色のトークンを足す必要がない。
                className={cn("w-fit gap-2", savedState.isPinned && "text-primary")}
                disabled={isSaving}
                onClick={() => {
                  void handleLawPinToggle();
                }}
                type="button"
                variant={savedState.isPinned ? "outline" : "default"}
              >
                {savedState.isPinned ? (
                  <CircleCheck className="size-4" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
                {savedState.isPinned ? "ダウンロード済み" : "ダウンロード"}
              </Button>
            </div>

            <p className="text-[0.625rem] font-medium tracking-widest text-muted-foreground">
              目次
            </p>
            {/* 条番号ジャンプは目次のナビ補助なので目次直下に置く。ラベルは省き
                aria-label で名前を保ちつつ、Input と移動ボタンを1行に収める。 */}
            <form className="flex gap-2" onSubmit={handleJumpSubmit}>
              <Input
                aria-describedby={hasJumpError ? articleJumpErrorId : undefined}
                aria-invalid={hasJumpError ? true : undefined}
                aria-label="条番号"
                autoComplete="off"
                className="min-w-0 flex-1"
                id={articleInputId}
                name="article"
                onChange={(event) => {
                  setJumpArticleNumber(event.target.value);
                  setHasJumpError(false);
                }}
                placeholder="条番号..."
                value={jumpArticleNumber}
              />
              <Button className="shrink-0" type="submit">
                移動
              </Button>
            </form>
            {hasArticleError ? notFoundAlert : null}
            <LawTableOfContents
              activeArticleNumber={activeArticleNumber}
              displayMode={displayMode}
              items={tocItems}
              onSelectArticle={navigateToArticle}
            />
          </div>
        </aside>

        {/* 中央は本文カラム。lg 以上では左右パディングを広げ、両サイドバー（と
            アクティブ条の左端インジケーター）との間に余白を確保する。 */}
        <div className="min-w-0 px-4 py-6 md:px-8 lg:px-14">
          {/* モバイル用サブバー（lg 以上は左右レールがあるため非表示）。
              本文スクロール中も導線を保つため、ヘッダ直下に sticky で固定する。 */}
          <div className="sticky top-14 z-20 mb-4 flex flex-wrap items-center gap-2 bg-popover/95 py-2 backdrop-blur lg:hidden">
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

          {/* オンライン/オフラインは常時表示しない（保存状態は左レールの保存ボタンで判別できる）。
              保存版を表示中・保存日時は保存版を見ているときだけ知らせる。 */}
          {savedState.loadedFromStorage || savedState.savedAt !== undefined ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {savedState.loadedFromStorage ? (
                <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
                  保存済み本文を表示中
                </span>
              ) : null}
              {savedState.savedAt !== undefined ? (
                <span>保存日時: {formatIsoDateLabel(savedState.savedAt)}</span>
              ) : null}
            </div>
          ) : null}

          <div ref={documentRef}>
            <LawDocumentView
              activeArticleNumber={activeArticleNumber}
              displayMode={displayMode}
              law={state.law}
              nodes={state.nodes}
              onSelectArticle={navigateToArticle}
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
            {/* ダウンロード */}
            <Button
              aria-describedby={saveError === undefined ? undefined : `${saveErrorId}-mobile`}
              // 済みの状態は既存の主色で示す。このテーマの --primary は #166534
              // （ダークは #4ade80）で既に緑なので、成功色のトークンを足す必要がない。
              className={cn("w-fit gap-2", savedState.isPinned && "text-primary")}
              disabled={isSaving}
              onClick={() => {
                void handleLawPinToggle();
              }}
              type="button"
              variant={savedState.isPinned ? "outline" : "default"}
            >
              {savedState.isPinned ? (
                <CircleCheck className="size-4" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              {savedState.isPinned ? "ダウンロード済み" : "ダウンロード"}
            </Button>
            {/* 保存失敗はシート表示中だと本文側の alert が隠れるため、シート内にも通知する。 */}
            {saveError !== undefined ? (
              <p
                id={`${saveErrorId}-mobile`}
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-display text-destructive"
              >
                {saveError}
              </p>
            ) : null}
            {/* 基準日情報（未設定=現行法なら基準日は省く） */}
            <p className="text-sm leading-display text-muted-foreground">
              {formatBaseDatePrefix(state)}
              施行日 {formatEffectiveDateLabel(state.revision)}
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
      {popover === undefined ? null : (
        <HighlightColorPopover
          anchorRect={popover.anchorRect}
          autoFocus={popover.autoFocus}
          onDelete={
            popover.annotationId === undefined
              ? undefined
              : () => {
                  const annotationId = popover.annotationId;

                  if (annotationId !== undefined) {
                    void remove(annotationId);
                  }

                  setPopover(undefined);
                }
          }
          onDismiss={() => {
            setPopover(undefined);
          }}
          onSelect={(color) => {
            highlightSelection(popover, color);
            setPopover(undefined);
            window.getSelection()?.removeAllRanges();
          }}
          selectedColor={popover.color}
        />
      )}
    </>
  );
};

const collectTocArticleNumbers = (items: LawTocItem[]): string[] =>
  items.flatMap((item) => [
    ...(item.articleNumber === undefined ? [] : [item.articleNumber]),
    ...collectTocArticleNumbers(item.children),
  ]);

// 表示に使った基準日のラベル。未設定なら現行法である旨を示し、基準日時点に版が無く
// 現行法へ落ちたときは対象外である旨を添える。
const formatBaseDateLabel = (state: Extract<LawViewerState, { status: "ready" }>): string => {
  if (state.requestedAsOf === undefined) {
    return "未設定（現行法）";
  }

  const label = formatIsoDateLabel(state.requestedAsOf);

  return state.baseDateFallback === true ? `${label}（対象外・現行法を表示）` : label;
};

// 基準日が未設定のときは「基準日 未設定」を出さず施行日だけにする箇所で使う前置き。
const formatBaseDatePrefix = (state: Extract<LawViewerState, { status: "ready" }>): string =>
  state.requestedAsOf === undefined ? "" : `基準日 ${formatBaseDateLabel(state)} ・ `;

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
