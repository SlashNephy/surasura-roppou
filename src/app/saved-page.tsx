import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Archive, FolderPlus, StickyNote, type LucideIcon } from "lucide-react";

import type { Bookmark, Collection } from "@/core/domain";
import {
  createSavedLawUseCase,
  createStorageRepository,
  type SavedLawSummary,
  type StorageRepository,
} from "@/core/storage";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const defaultStorageRepository = createStorageRepository();

interface SavedPageProps {
  storageRepository?: StorageRepository;
}

type CollectionPageState =
  | {
      bookmarks: Bookmark[];
      collection: Collection | undefined;
      collectionId: string;
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
  savedLaws: SavedLawSummary[];
}

export const SavedPage = ({ storageRepository = defaultStorageRepository }: SavedPageProps) => {
  const [savedLaws, setSavedLaws] = useState<SavedLawSummary[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | undefined>();
  const savedLawUseCase = useMemo(
    () => createSavedLawUseCase(storageRepository),
    [storageRepository],
  );

  const loadSavedPageData = useCallback(async (): Promise<SavedPageData> => {
    const [nextSavedLaws, nextBookmarks, nextCollections] = await Promise.all([
      savedLawUseCase.list(),
      storageRepository.listBookmarks(),
      storageRepository.listCollections(),
    ]);

    return {
      bookmarks: nextBookmarks,
      collections: nextCollections,
      savedLaws: nextSavedLaws,
    };
  }, [savedLawUseCase, storageRepository]);

  const applySavedPageData = useCallback((data: SavedPageData) => {
    setSavedLaws(data.savedLaws);
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
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 md:px-6">
      <div className="grid gap-3">
        <p className="text-sm font-medium text-primary">Saved</p>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
          保存リスト
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          保存した法令、メモ付きの条文、学習用コレクションをまとめて管理します。
        </p>
      </div>

      {error === undefined ? null : <StatusMessage>{error}</StatusMessage>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="grid gap-6">
          <SavedLawList savedLaws={savedLaws} />
          <BookmarkList bookmarks={bookmarks} />
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

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([storageRepository.listBookmarks(), storageRepository.listCollections()])
      .then(([nextBookmarks, nextCollections]) => {
        if (isCurrent) {
          setState({
            bookmarks: nextBookmarks,
            collection: nextCollections.find((item) => item.id === collectionId),
            collectionId,
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
  }, [collectionId, storageRepository]);

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
        <StatusMessage>{state.error}</StatusMessage>
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

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6 px-5 py-8 md:px-6">
      <div className="grid gap-3">
        <p className="text-sm font-medium text-primary">Collection</p>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
          {collection.title}
        </h1>
        {collection.description === undefined ? null : (
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            {collection.description}
          </p>
        )}
      </div>

      <BookmarkList bookmarks={collectionBookmarks} emptyMessage="このコレクションは空です。" />
    </section>
  );
};

const SavedLawList = ({ savedLaws }: { savedLaws: SavedLawSummary[] }) => (
  <section aria-labelledby="saved-laws-heading" className="grid gap-3">
    <SectionHeading icon={Archive} id="saved-laws-heading" title="保存済み法令" />
    {savedLaws.length === 0 ? (
      <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
        保存済み法令はまだありません。
      </p>
    ) : (
      <ul className="grid gap-2">
        {savedLaws.map((savedLaw) => (
          <li key={savedLaw.law.lawId} className="rounded-md border bg-card p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 gap-2">
                <Link
                  className="text-base font-semibold text-foreground underline-offset-4 hover:underline"
                  params={{ lawId: savedLaw.law.lawId }}
                  to="/laws/$lawId"
                >
                  {savedLaw.law.title}
                </Link>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>最終取得: {formatDate(savedLaw.revision.fetchedAt)}</span>
                  <span>{savedLaw.nodeCount.toLocaleString("ja-JP")} ノード</span>
                </div>
              </div>
              <Badge variant="secondary">オフライン保存済み</Badge>
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
}: {
  bookmarks: Bookmark[];
  emptyMessage?: string;
}) => (
  <section aria-labelledby="bookmarks-heading" className="grid gap-3">
    <SectionHeading icon={StickyNote} id="bookmarks-heading" title="保存項目" />
    {bookmarks.length === 0 ? (
      <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    ) : (
      <ul className="grid gap-2">
        {bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="rounded-md border bg-card p-4">
            <div className="grid gap-2">
              <BookmarkLink bookmark={bookmark} />
              {bookmark.note === undefined ? null : (
                <p className="text-sm leading-6 text-muted-foreground">{bookmark.note}</p>
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
      <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
        コレクションはまだありません。
      </p>
    ) : (
      <ul className="grid gap-2">
        {collections.map((collection) => (
          <li key={collection.id} className="rounded-md border bg-card p-4">
            <div className="grid gap-2">
              <Link
                className="text-base font-semibold text-foreground underline-offset-4 hover:underline"
                params={{ collectionId: collection.id }}
                to="/saved/collections/$collectionId"
              >
                {collection.title}
              </Link>
              {collection.description === undefined ? null : (
                <p className="text-sm leading-6 text-muted-foreground">{collection.description}</p>
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

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setError(undefined);

    if (title.trim() === "" || lawId.trim() === "") {
      return;
    }

    const now = new Date().toISOString();

    try {
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
      {error === undefined ? null : <StatusMessage>{error}</StatusMessage>}
      <label className="grid gap-1 text-sm font-medium text-foreground">
        保存タイトル
        <Input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground">
        法令ID
        <Input
          value={lawId}
          onChange={(event) => {
            setLawId(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground">
        条番号
        <Input
          value={article}
          onChange={(event) => {
            setArticle(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground">
        タグ
        <Input
          value={tags}
          onChange={(event) => {
            setTags(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground">
        メモ
        <textarea
          className="min-h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
      <Button className="w-fit" type="submit">
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

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setError(undefined);

    if (title.trim() === "") {
      return;
    }

    const now = new Date().toISOString();

    try {
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
      {error === undefined ? null : <StatusMessage>{error}</StatusMessage>}
      <label className="grid gap-1 text-sm font-medium text-foreground">
        コレクション名
        <Input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-foreground">
        説明
        <Input
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-foreground">保存項目</legend>
        {bookmarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">保存項目を追加すると選択できます。</p>
        ) : (
          bookmarks.map((bookmark) => (
            <label key={bookmark.id} className="flex items-center gap-2 text-sm text-foreground">
              <input
                checked={selectedBookmarkIds.includes(bookmark.id)}
                className="size-4 accent-primary"
                onChange={() => {
                  toggleBookmark(bookmark.id);
                }}
                type="checkbox"
              />
              {bookmark.title}
            </label>
          ))
        )}
      </fieldset>
      <Button className="w-fit" type="submit">
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

const StatusMessage = ({ children }: { children: string }) => (
  <p
    role="status"
    className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground"
  >
    {children}
  </p>
);

const BookmarkLink = ({ bookmark }: { bookmark: Bookmark }) => {
  if (bookmark.target.article === undefined || bookmark.target.article === null) {
    return (
      <Link
        className="text-base font-semibold text-foreground underline-offset-4 hover:underline"
        params={{ lawId: bookmark.target.lawId }}
        to="/laws/$lawId"
      >
        {bookmark.title}
      </Link>
    );
  }

  return (
    <Link
      className="text-base font-semibold text-foreground underline-offset-4 hover:underline"
      params={{ lawId: bookmark.target.lawId, article: bookmark.target.article }}
      to="/laws/$lawId/articles/$article"
    >
      {bookmark.title}
    </Link>
  );
};

const parseTags = (value: string): string[] =>
  value
    .split(/[,，、]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

const formatDate = (value: string): string =>
  typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : "不明";

const generateStorageId = (): string => {
  const browserCrypto = (globalThis as { crypto?: Crypto }).crypto;

  if (browserCrypto === undefined) {
    return generateFallbackStorageId();
  }

  if (typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  if (typeof browserCrypto.getRandomValues === "function") {
    const values = new Uint32Array(2);
    browserCrypto.getRandomValues(values);

    return `${Date.now().toString(36)}-${values[0].toString(36)}${values[1].toString(36)}`;
  }

  return generateFallbackStorageId();
};

const generateFallbackStorageId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
