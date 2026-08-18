import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Archive,
  CircleCheck,
  Download,
  FolderPlus,
  StickyNote,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import type { Bookmark, Collection } from "@/core/domain";
import { createSavedDataFile } from "@/core/native-integration";
import {
  comparePinnedLaws,
  createSavedLawUseCase,
  createStorageRepository,
  generateStorageId,
  type SavedLawSummary,
  type StorageRepository,
} from "@/core/storage";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { formatByteSize } from "@/shared/utils/bytes";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { useDocumentTitle } from "./document-title";
import { downloadTextFile } from "./download-text-file";
import { parseTags } from "./saved-page-utils";
import { getCurrentStorageLimitBytes, useStorageLimit } from "./use-storage-limit";

const defaultStorageRepository = createStorageRepository();

interface SavedPageProps {
  storageRepository?: StorageRepository;
}

type CollectionPageState =
  | {
      bookmarks: Bookmark[];
      collection: Collection | undefined;
      collectionId: string;
      savedLaws: SavedLawSummary[];
      status: "loaded";
    }
  | {
      collectionId: string;
      error: string;
      status: "error";
    }
  | {
      collectionId: string;
      status: "loading";
    };

interface SavedPageData {
  bookmarks: Bookmark[];
  collections: Collection[];
  // 法令単位のピン留め。pinnedAt はセクション内の並び順に使うため Set ではなく Map で持つ。
  pinnedAtByLawId: Map<string, string>;
  savedLaws: SavedLawSummary[];
}

export const SavedPage = ({ storageRepository = defaultStorageRepository }: SavedPageProps) => {
  useDocumentTitle("保存リスト");
  const [savedLaws, setSavedLaws] = useState<SavedLawSummary[]>([]);
  const [pinnedAtByLawId, setPinnedAtByLawId] = useState<Map<string, string>>(
    new Map<string, string>(),
  );
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [exportMessage, setExportMessage] = useState<string | undefined>();
  const [exportError, setExportError] = useState<string | undefined>();
  const [isExporting, setIsExporting] = useState(false);
  const [lawPendingDeletion, setLawPendingDeletion] = useState<SavedLawSummary | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const { limitBytes } = useStorageLimit();
  const savedLawUseCase = useMemo(
    () =>
      createSavedLawUseCase(storageRepository, {
        getStorageLimitBytes: getCurrentStorageLimitBytes,
      }),
    [storageRepository],
  );
  const savedLawTitlesById = useMemo(
    () => new Map(savedLaws.map((savedLaw) => [savedLaw.law.lawId, savedLaw.law.title])),
    [savedLaws],
  );

  const loadSavedPageData = useCallback(async (): Promise<SavedPageData> => {
    const [nextSavedLaws, nextPinnedLaws, nextBookmarks, nextCollections] = await Promise.all([
      savedLawUseCase.list(),
      savedLawUseCase.listPinned(),
      storageRepository.listBookmarks(),
      storageRepository.listCollections(),
    ]);

    return {
      bookmarks: nextBookmarks,
      collections: nextCollections,
      pinnedAtByLawId: new Map(
        nextPinnedLaws.map((pinnedLaw) => [pinnedLaw.lawId, pinnedLaw.pinnedAt]),
      ),
      savedLaws: nextSavedLaws,
    };
  }, [savedLawUseCase, storageRepository]);

  const applySavedPageData = useCallback((data: SavedPageData) => {
    setSavedLaws(data.savedLaws);
    setPinnedAtByLawId(data.pinnedAtByLawId);
    setBookmarks(data.bookmarks);
    setCollections(data.collections);
    setError(undefined);
  }, []);

  const reload = useCallback(async () => {
    try {
      applySavedPageData(await loadSavedPageData());
    } catch {
      setError("保存リストを読み込めませんでした。");
    }
  }, [applySavedPageData, loadSavedPageData]);

  const handleConfirmDelete = async () => {
    if (lawPendingDeletion === undefined || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(undefined);

    try {
      await savedLawUseCase.remove(lawPendingDeletion.law.lawId);
      setLawPendingDeletion(undefined);
      await reload();
    } catch {
      // ダイアログはポータルで別ツリーに描画され開いている間はページ本体が
      // aria-hidden になるため、失敗はダイアログ内で知らせて再試行できるようにする。
      setDeleteError("法令を削除できませんでした。時間をおいて再試行してください。");
    } finally {
      setIsDeleting(false);
    }
  };

  const requestDeleteLaw = (savedLaw: SavedLawSummary) => {
    setDeleteError(undefined);
    setLawPendingDeletion(savedLaw);
  };

  useEffect(() => {
    let isCurrent = true;

    void loadSavedPageData()
      .then((data) => {
        if (isCurrent) {
          applySavedPageData(data);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setError("保存リストを読み込めませんでした。");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [applySavedPageData, loadSavedPageData]);

  useEffect(() => {
    if (exportMessage === undefined && exportError === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setExportMessage(undefined);
      setExportError(undefined);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [exportError, exportMessage]);

  const handleExport = async () => {
    if (isExporting) {
      return;
    }

    setExportMessage(undefined);
    setExportError(undefined);
    setIsExporting(true);

    try {
      const file = await createSavedDataFile(storageRepository, new Date());
      downloadTextFile(file);
      setExportMessage("JSONを書き出しました。");
    } catch {
      setExportError(
        "JSONを書き出せませんでした。保存データを読み込める状態で再試行してください。",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const usedBytes = savedLaws.reduce((sum, savedLaw) => sum + (savedLaw.byteSize ?? 0), 0);
  const pinnedBytes = savedLaws
    .filter((savedLaw) => pinnedAtByLawId.has(savedLaw.law.lawId))
    .reduce((sum, savedLaw) => sum + (savedLaw.byteSize ?? 0), 0);

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 md:px-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-3">
          <p className="text-sm font-medium text-primary">Saved</p>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
            保存リスト
          </h1>
          <p className="max-w-2xl text-base leading-display text-muted-foreground">
            保存した法令、メモ付きの条文、学習用コレクションをまとめて管理します。
          </p>
        </div>
        <Button
          className="w-fit gap-2"
          disabled={isExporting}
          onClick={() => {
            void handleExport();
          }}
          type="button"
          variant="outline"
        >
          <Download className="size-4" aria-hidden="true" />
          JSONをエクスポート
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        オフライン保存: {formatByteSize(usedBytes)} / {formatByteSize(limitBytes)}
        <span className="ml-2">
          （ダウンロード済み {formatByteSize(pinnedBytes)} ・ 最近開いた{" "}
          {formatByteSize(usedBytes - pinnedBytes)}）
        </span>
      </p>

      {error === undefined ? null : <ErrorMessage>{error}</ErrorMessage>}
      {exportMessage === undefined ? null : <StatusMessage>{exportMessage}</StatusMessage>}
      {exportError === undefined ? null : <ErrorMessage>{exportError}</ErrorMessage>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="grid gap-6">
          <SavedLawList
            emptyMessage="ダウンロードした法令はまだありません。"
            headingId="pinned-laws-heading"
            icon={CircleCheck}
            onRequestDelete={requestDeleteLaw}
            savedLaws={toPinnedSavedLaws(savedLaws, pinnedAtByLawId)}
            title="ダウンロード済み"
          />
          <SavedLawList
            description="空き容量が足りなくなると、下にあるものから削除されます。"
            emptyMessage="最近開いた法令はまだありません。"
            headingId="recent-laws-heading"
            icon={Archive}
            onRequestDelete={requestDeleteLaw}
            // updatedAt 降順。PR 3 の LRU が消す順の逆順にあたる。
            savedLaws={savedLaws
              .filter((savedLaw) => !pinnedAtByLawId.has(savedLaw.law.lawId))
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))}
            title="最近開いた法令"
          />
          <BookmarkList bookmarks={bookmarks} lawTitlesById={savedLawTitlesById} />
          <CollectionList collections={collections} />
        </div>

        <div className="grid gap-6">
          <BookmarkForm onCreated={reload} storageRepository={storageRepository} />
          <CollectionForm
            bookmarks={bookmarks}
            onCreated={reload}
            storageRepository={storageRepository}
          />
        </div>
      </div>

      {lawPendingDeletion === undefined ? null : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !isDeleting) {
              setLawPendingDeletion(undefined);
              setDeleteError(undefined);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lawPendingDeletion.law.title}を削除</DialogTitle>
              <DialogDescription>
                この法令の保存データを削除します。もう一度開けば再取得されます。
              </DialogDescription>
            </DialogHeader>
            {deleteError === undefined ? null : <ErrorMessage>{deleteError}</ErrorMessage>}
            <DialogFooter>
              <Button
                disabled={isDeleting}
                onClick={() => {
                  void handleConfirmDelete();
                }}
                type="button"
                variant="destructive"
              >
                削除する
              </Button>
              <Button
                disabled={isDeleting}
                onClick={() => {
                  setLawPendingDeletion(undefined);
                  setDeleteError(undefined);
                }}
                type="button"
                variant="outline"
              >
                キャンセル
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
};

export const SavedCollectionPage = ({
  storageRepository = defaultStorageRepository,
}: SavedPageProps) => {
  const { collectionId = "" } =
    useParams({
      from: "/saved/collections/$collectionId",
      shouldThrow: false,
    }) ?? {};
  const [state, setState] = useState<CollectionPageState>({
    collectionId,
    status: "loading",
  });
  const savedLawUseCase = useMemo(
    () =>
      createSavedLawUseCase(storageRepository, {
        getStorageLimitBytes: getCurrentStorageLimitBytes,
      }),
    [storageRepository],
  );
  // 読み込み中とコレクション未検出のときは、実タイトルが確定していないのでアプリ名だけを出す。
  useDocumentTitle(state.status === "loaded" ? state.collection?.title : undefined);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      storageRepository.listBookmarks(),
      storageRepository.listCollections(),
      savedLawUseCase.list(),
    ])
      .then(([nextBookmarks, nextCollections, nextSavedLaws]) => {
        if (isCurrent) {
          setState({
            bookmarks: nextBookmarks,
            collection: nextCollections.find((item) => item.id === collectionId),
            collectionId,
            savedLaws: nextSavedLaws,
            status: "loaded",
          });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setState({
            collectionId,
            error: "コレクションを読み込めませんでした。",
            status: "error",
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [collectionId, savedLawUseCase, storageRepository]);

  if (state.collectionId !== collectionId || state.status === "loading") {
    return (
      <section className="mx-auto grid w-full max-w-4xl gap-6 px-5 py-8 md:px-6">
        <StatusMessage>コレクションを読み込んでいます。</StatusMessage>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-2xl flex-col justify-center gap-4 px-5 py-10">
        <ErrorMessage>{state.error}</ErrorMessage>
        <Button asChild className="w-fit" variant="outline">
          <Link to="/saved">保存リストへ戻る</Link>
        </Button>
      </section>
    );
  }

  if (state.collection === undefined) {
    return (
      <section className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-2xl flex-col justify-center gap-4 px-5 py-10">
        <h1 className="text-2xl font-semibold text-foreground">コレクションが見つかりません</h1>
        <Button asChild className="w-fit" variant="outline">
          <Link to="/saved">保存リストへ戻る</Link>
        </Button>
      </section>
    );
  }

  const collection = state.collection;
  const collectionBookmarks = state.bookmarks.filter((bookmark) =>
    collection.bookmarkIds.includes(bookmark.id),
  );
  const lawTitlesById = new Map(
    state.savedLaws.map((savedLaw) => [savedLaw.law.lawId, savedLaw.law.title]),
  );

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6 px-5 py-8 md:px-6">
      <div className="grid gap-3">
        <Button asChild className="w-fit" variant="outline">
          <Link to="/saved">保存リストへ戻る</Link>
        </Button>
        <p className="text-sm font-medium text-primary">Collection</p>
        <h1 className="min-w-0 break-words text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
          {collection.title}
        </h1>
        {collection.description === undefined ? null : (
          <p className="max-w-2xl min-w-0 break-words text-base leading-display text-muted-foreground">
            {collection.description}
          </p>
        )}
      </div>

      <BookmarkList
        bookmarks={collectionBookmarks}
        emptyMessage="このコレクションは空です。"
        lawTitlesById={lawTitlesById}
      />
    </section>
  );
};

/**
 * ピン留めされた保存法令を、リポジトリの `listPinnedLaws` と同じ規則で並べる。
 *
 * 抽出と比較を `flatMap` にまとめ、`pinnedAt` が必ず存在することを型で示す。
 * 先に `has` で絞ってから `get` を引き直すと、到達しないフォールバック値
 * （`?? ""`）を書く羽目になり、配線の誤りを覆い隠す。
 */
const toPinnedSavedLaws = (
  savedLaws: SavedLawSummary[],
  pinnedAtByLawId: Map<string, string>,
): SavedLawSummary[] =>
  savedLaws
    .flatMap((savedLaw) => {
      const pinnedAt = pinnedAtByLawId.get(savedLaw.law.lawId);

      return pinnedAt === undefined ? [] : [{ lawId: savedLaw.law.lawId, pinnedAt, savedLaw }];
    })
    .sort(comparePinnedLaws)
    .map((entry) => entry.savedLaw);

const SavedLawList = ({
  description,
  emptyMessage,
  headingId,
  icon,
  onRequestDelete,
  savedLaws,
  title,
}: {
  description?: string;
  emptyMessage: string;
  headingId: string;
  icon: LucideIcon;
  onRequestDelete: (savedLaw: SavedLawSummary) => void;
  savedLaws: SavedLawSummary[];
  title: string;
}) => (
  <section aria-labelledby={headingId} className="grid gap-3">
    <SectionHeading icon={icon} id={headingId} title={title} />
    {description === undefined ? null : (
      <p className="text-sm text-muted-foreground">{description}</p>
    )}
    {savedLaws.length === 0 ? (
      <EmptyState>{emptyMessage}</EmptyState>
    ) : (
      <ul className="grid gap-2">
        {savedLaws.map((savedLaw) => (
          <li key={savedLaw.law.lawId} className="rounded-md border bg-card p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 gap-2">
                <Link
                  className="min-w-0 break-words text-base leading-display font-semibold text-foreground underline-offset-4 hover:underline"
                  params={{ lawId: savedLaw.law.lawId }}
                  to="/laws/$lawId"
                >
                  {savedLaw.law.title}
                </Link>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>最終取得: {formatIsoDateLabel(savedLaw.revision.fetchedAt)}</span>
                  {savedLaw.byteSize === undefined ? null : (
                    <span>{formatByteSize(savedLaw.byteSize)}</span>
                  )}
                </div>
              </div>
              <Button
                aria-label={`${savedLaw.law.title}を削除`}
                className="shrink-0"
                onClick={() => {
                  onRequestDelete(savedLaw);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const BookmarkList = ({
  bookmarks,
  emptyMessage = "保存項目はまだありません。",
  lawTitlesById,
}: {
  bookmarks: Bookmark[];
  emptyMessage?: string;
  lawTitlesById?: ReadonlyMap<string, string>;
}) => (
  <section aria-labelledby="bookmarks-heading" className="grid gap-3">
    <SectionHeading icon={StickyNote} id="bookmarks-heading" title="保存項目" />
    {bookmarks.length === 0 ? (
      <EmptyState>{emptyMessage}</EmptyState>
    ) : (
      <ul className="grid gap-2">
        {bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="rounded-md border bg-card p-4">
            <div className="grid gap-2">
              <BookmarkLink bookmark={bookmark} />
              <p className="min-w-0 break-words text-sm leading-display text-muted-foreground">
                法令: {lawTitlesById?.get(bookmark.target.lawId) ?? bookmark.target.lawId}
              </p>
              {bookmark.note === undefined ? null : (
                <p className="whitespace-pre-wrap break-words text-sm leading-display text-muted-foreground">
                  {bookmark.note}
                </p>
              )}
              {bookmark.tags.length === 0 ? null : (
                <div className="flex flex-wrap gap-2">
                  {bookmark.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const CollectionList = ({ collections }: { collections: Collection[] }) => (
  <section aria-labelledby="collections-heading" className="grid gap-3">
    <SectionHeading icon={FolderPlus} id="collections-heading" title="コレクション" />
    {collections.length === 0 ? (
      <EmptyState>コレクションはまだありません。</EmptyState>
    ) : (
      <ul className="grid gap-2">
        {collections.map((collection) => (
          <li key={collection.id} className="rounded-md border bg-card p-4">
            <div className="grid gap-2">
              <Link
                className="min-w-0 break-words text-base leading-display font-semibold text-foreground underline-offset-4 hover:underline"
                params={{ collectionId: collection.id }}
                to="/saved/collections/$collectionId"
              >
                {collection.title}
              </Link>
              {collection.description === undefined ? null : (
                <p className="min-w-0 break-words text-sm leading-display text-muted-foreground">
                  {collection.description}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {collection.bookmarkIds.length.toLocaleString("ja-JP")} 件
              </p>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const BookmarkForm = ({
  onCreated,
  storageRepository,
}: {
  onCreated: () => Promise<void>;
  storageRepository: StorageRepository;
}) => {
  const [title, setTitle] = useState("");
  const [lawId, setLawId] = useState("");
  const [article, setArticle] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError(undefined);

    if (title.trim() === "" || lawId.trim() === "") {
      setError("保存タイトルと法令IDを入力してください。");
      return;
    }

    const now = new Date().toISOString();

    try {
      setIsSubmitting(true);
      await storageRepository.putBookmark({
        id: generateStorageId(),
        target: {
          lawId: lawId.trim(),
          ...(article.trim() === "" ? {} : { article: article.trim() }),
        },
        title: title.trim(),
        ...(note.trim() === "" ? {} : { note: note.trim() }),
        tags: parseTags(tags),
        createdAt: now,
        updatedAt: now,
      });
      await onCreated();
      setTitle("");
      setLawId("");
      setArticle("");
      setTags("");
      setNote("");
    } catch {
      setError("保存項目を追加できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="grid gap-3 rounded-md border bg-card p-4"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">保存項目を追加</h2>
      {error === undefined ? null : <ErrorMessage>{error}</ErrorMessage>}
      <label className="grid gap-1 text-sm font-medium text-foreground" htmlFor="bookmark-title">
        保存タイトル
        <Input
          aria-invalid={error === undefined ? undefined : true}
          disabled={isSubmitting}
          id="bookmark-title"
          required
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground" htmlFor="bookmark-law-id">
        法令ID
        <Input
          aria-invalid={error === undefined ? undefined : true}
          disabled={isSubmitting}
          id="bookmark-law-id"
          required
          value={lawId}
          onChange={(event) => {
            setLawId(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground" htmlFor="bookmark-article">
        条番号
        <Input
          disabled={isSubmitting}
          id="bookmark-article"
          value={article}
          onChange={(event) => {
            setArticle(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground" htmlFor="bookmark-tags">
        タグ
        <Input
          disabled={isSubmitting}
          id="bookmark-tags"
          value={tags}
          onChange={(event) => {
            setTags(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground" htmlFor="bookmark-note">
        メモ
        <textarea
          className="min-h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          disabled={isSubmitting}
          id="bookmark-note"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
      <Button className="w-fit" disabled={isSubmitting} type="submit">
        保存項目を追加
      </Button>
    </form>
  );
};

const CollectionForm = ({
  bookmarks,
  onCreated,
  storageRepository,
}: {
  bookmarks: Bookmark[];
  onCreated: () => Promise<void>;
  storageRepository: StorageRepository;
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError(undefined);

    if (title.trim() === "") {
      setError("コレクション名を入力してください。");
      return;
    }

    const now = new Date().toISOString();

    try {
      setIsSubmitting(true);
      await storageRepository.putCollection({
        id: generateStorageId(),
        title: title.trim(),
        ...(description.trim() === "" ? {} : { description: description.trim() }),
        bookmarkIds: selectedBookmarkIds,
        createdAt: now,
        updatedAt: now,
      });
      await onCreated();
      setTitle("");
      setDescription("");
      setSelectedBookmarkIds([]);
    } catch {
      setError("コレクションを作成できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleBookmark = (bookmarkId: string) => {
    setSelectedBookmarkIds((current) =>
      current.includes(bookmarkId)
        ? current.filter((currentBookmarkId) => currentBookmarkId !== bookmarkId)
        : [...current, bookmarkId],
    );
  };

  return (
    <form
      className="grid gap-3 rounded-md border bg-card p-4"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">コレクションを作成</h2>
      {error === undefined ? null : <ErrorMessage>{error}</ErrorMessage>}
      <label className="grid gap-1 text-sm font-medium text-foreground" htmlFor="collection-title">
        コレクション名
        <Input
          aria-invalid={error === undefined ? undefined : true}
          disabled={isSubmitting}
          id="collection-title"
          required
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </label>
      <label
        className="grid gap-1 text-sm font-medium text-foreground"
        htmlFor="collection-description"
      >
        説明
        <Input
          disabled={isSubmitting}
          id="collection-description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-foreground">保存項目</legend>
        {bookmarks.length === 0 ? (
          <p className="text-sm leading-display text-muted-foreground">
            保存項目を追加すると選択できます。
          </p>
        ) : (
          <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border bg-background p-2 pr-3">
            {bookmarks.map((bookmark) => (
              <label
                key={bookmark.id}
                className="flex min-w-0 items-center gap-2 text-sm text-foreground"
              >
                <input
                  checked={selectedBookmarkIds.includes(bookmark.id)}
                  className="size-4 shrink-0 accent-primary"
                  disabled={isSubmitting}
                  onChange={() => {
                    toggleBookmark(bookmark.id);
                  }}
                  type="checkbox"
                />
                <span className="min-w-0 break-words">{bookmark.title}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Button className="w-fit" disabled={isSubmitting} type="submit">
        コレクションを作成
      </Button>
    </form>
  );
};

const SectionHeading = ({
  icon: Icon,
  id,
  title,
}: {
  icon: LucideIcon;
  id: string;
  title: string;
}) => (
  <div className="flex min-w-0 items-center gap-2">
    <Icon className="size-4 text-primary" aria-hidden="true" />
    <h2 id={id} className="text-lg font-semibold text-foreground">
      {title}
    </h2>
  </div>
);

const PanelMessage = ({ children, role }: { children: string; role?: "status" }) => (
  <p
    role={role}
    className="rounded-md border border-dashed px-4 py-5 text-sm leading-display text-muted-foreground"
  >
    {children}
  </p>
);

const EmptyState = ({ children }: { children: string }) => <PanelMessage>{children}</PanelMessage>;

const StatusMessage = ({ children }: { children: string }) => (
  <p
    role="status"
    className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm leading-display text-primary"
  >
    {children}
  </p>
);

const ErrorMessage = ({ children }: { children: string }) => (
  <p
    role="alert"
    className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm leading-display text-destructive"
  >
    {children}
  </p>
);

const BookmarkLink = ({ bookmark }: { bookmark: Bookmark }) => {
  const article = bookmark.target.article?.trim();

  if (article === undefined || article === "") {
    return (
      <Link
        className="min-w-0 break-words text-base leading-display font-semibold text-foreground underline-offset-4 hover:underline"
        params={{ lawId: bookmark.target.lawId }}
        to="/laws/$lawId"
      >
        {bookmark.title}
      </Link>
    );
  }

  return (
    <Link
      className="min-w-0 break-words text-base leading-display font-semibold text-foreground underline-offset-4 hover:underline"
      params={{ lawId: bookmark.target.lawId, article }}
      to="/laws/$lawId/articles/$article"
    >
      {bookmark.title}
    </Link>
  );
};
