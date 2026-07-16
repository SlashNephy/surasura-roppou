import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Pin } from "lucide-react";

import type { StudyCard } from "@/core/domain";
import { createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import { findSubject, gyoseishoshiSubjects, isLawInSubject } from "@/core/study";
import type { SubjectId } from "@/core/study";
import { Badge } from "@/shared/ui/badge";
import { Select } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { studyCardTypeLabels } from "./study-card-form";

const defaultStorageRepository = createStorageRepository();

type StudyCardsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; cards: StudyCard[]; lawTitlesById: ReadonlyMap<string, string> };

interface StudyCardsPageProps {
  storageRepository?: StorageRepository;
}

export const StudyCardsPage = ({
  storageRepository = defaultStorageRepository,
}: StudyCardsPageProps = {}) => {
  const { subject } = useSearch({ from: "/study/cards" });
  const navigate = useNavigate({ from: "/study/cards" });
  const [state, setState] = useState<StudyCardsState>({ status: "loading" });
  const [lawFilter, setLawFilter] = useState("all");
  // 科目フィルタは URL の subject を Source of Truth とする。ローカル state と二重管理せず、
  // リロード・URL 共有・ブラウザの戻る進むでも選択が保持される。
  const subjectFilter: SubjectId | "all" = subject ?? "all";

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([storageRepository.listStudyCards(), storageRepository.listSavedLaws()])
      .then(([cards, savedLaws]) => {
        if (!isCurrent) {
          return;
        }

        setState({
          status: "ready",
          // updatedAt 降順で並べ、新しいカードを先頭に表示する。
          cards: [...cards].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
          lawTitlesById: new Map(
            savedLaws.map((savedLaw) => [savedLaw.law.lawId, savedLaw.law.title]),
          ),
        });
      })
      .catch(() => {
        if (isCurrent) {
          setState({ status: "error" });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [storageRepository]);

  // 法令フィルタの選択肢。カードが持つ lawId を集合で一意化する。
  const lawOptions = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    const lawIds = [...new Set(state.cards.map((card) => card.target.lawId))];

    return lawIds.map((lawId) => ({
      lawId,
      label: state.lawTitlesById.get(lawId) ?? lawId,
    }));
  }, [state]);

  const visibleCards =
    state.status === "ready"
      ? state.cards.filter(
          (card) =>
            (lawFilter === "all" || card.target.lawId === lawFilter) &&
            (subjectFilter === "all" || isLawInSubject(subjectFilter, card.target.lawId)),
        )
      : [];

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-4 px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-2xl font-semibold text-foreground">条文カード</h1>
          {state.status === "ready" ? (
            <p className="text-sm text-muted-foreground">
              {visibleCards.length.toLocaleString("ja-JP")} 件
            </p>
          ) : null}
        </div>
        <label className="grid w-full max-w-60 gap-1 text-sm font-medium text-foreground">
          科目で絞り込む
          <Select
            onChange={(event) => {
              // findSubject で検証し、不明値は「すべての科目」（= パラメータ削除）に倒す。
              // フィルタ操作で履歴を汚さないよう replace で URL を更新する。
              const nextSubject = findSubject(event.target.value)?.id;
              void navigate({
                search: (previous) => ({ ...previous, subject: nextSubject }),
                replace: true,
              });
            }}
            value={subjectFilter}
          >
            <option value="all">すべての科目</option>
            {gyoseishoshiSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid w-full max-w-60 gap-1 text-sm font-medium text-foreground">
          法令で絞り込む
          <Select
            onChange={(event) => {
              setLawFilter(event.target.value);
            }}
            value={lawFilter}
          >
            <option value="all">すべての法令</option>
            {lawOptions.map((option) => (
              <option key={option.lawId} value={option.lawId}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </header>

      {state.status === "loading" ? (
        <div className="grid gap-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {state.status === "error" ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-display text-destructive"
          role="alert"
        >
          カードを読み込めませんでした。ページを再読み込みしてください。
        </p>
      ) : null}

      {state.status === "ready" ? (
        visibleCards.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-sm leading-display text-muted-foreground">
            {state.cards.length === 0
              ? // 真の空状態: カードが 1 件も存在しない
                "カードはまだありません。法令ビューアの条文から作成できます。"
              : // 科目・法令フィルタの組み合わせで 0 件になった状態
                "絞り込み条件に一致するカードはありません。"}
          </p>
        ) : (
          <ul className="grid gap-2">
            {visibleCards.map((card) => (
              <li key={card.id} className="rounded-md border bg-card p-4">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{studyCardTypeLabels[card.type]}</Badge>
                    {card.examPinned ? (
                      <Badge variant="outline">
                        <Pin aria-hidden="true" className="size-3" />
                        試験直前
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      更新 {formatIsoDateLabel(card.updatedAt)}
                    </span>
                  </div>
                  <Link
                    className="line-clamp-2 whitespace-pre-wrap break-words text-base leading-display font-semibold text-foreground hover:underline underline-offset-4"
                    params={{ cardId: card.id }}
                    to="/study/cards/$cardId"
                  >
                    {card.question}
                  </Link>
                  <p className="text-sm leading-display text-muted-foreground">
                    根拠:{" "}
                    {/* ビューア起点の作成フローでは article が必ず入るが、
                        データ不整合時に「第null条」がレンダリングされるのを防ぐため
                        article が空の場合は条番号部分を省略して法令名のみ表示する。 */}
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      params={{ lawId: card.target.lawId, article: card.target.article ?? "" }}
                      to="/laws/$lawId/articles/$article"
                    >
                      {state.lawTitlesById.get(card.target.lawId) ?? card.target.lawId}
                      {card.target.article === null ||
                      card.target.article === undefined ||
                      card.target.article === ""
                        ? ""
                        : ` 第${card.target.article}条`}
                    </Link>
                  </p>
                  {card.tags.length === 0 ? null : (
                    <div className="flex flex-wrap gap-2">
                      {card.tags.map((tag) => (
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
        )
      ) : null}
    </section>
  );
};
