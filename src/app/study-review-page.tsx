import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import type { QuizRating, ReviewLog, StudyCard, StudySession } from "@/core/domain";
import type { LawRepository } from "@/core/egov";
import { resolveAsOf } from "@/core/settings";
import { createStorageRepository, generateStorageId } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import { fixedIntervalSchedulerId } from "@/core/study";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

import { studyCardTypeLabels } from "./study-card-form";
import { loadLawViewerDocument } from "./law-viewer-loader";
import type { LawViewerState } from "./law-viewer-page";
import { StudyReviewEvidencePanel } from "./study-review-evidence";
import {
  advanceQueue,
  formatIntervalLabel,
  newCardsPerSession,
  previewIntervals,
  quizRatingLabels,
  quizRatings,
} from "./study-review-queue";
import { useBaseDate } from "./use-base-date";

const defaultStorageRepository = createStorageRepository();

// "due" = 今日の復習(dueAt 到来分)、"new" = 新しく覚える(未学習カード)。
export type ReviewMode = "due" | "new";

const emptyGradeCounts: Record<QuizRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };

interface ActiveSession {
  sessionId: string;
  startedAt: string;
  cardIds: string[];
  // 先頭が出題中のカード。
  queue: StudyCard[];
  gradeCounts: Record<QuizRating, number>;
  phase:
    // shownAt は出題を表示した時刻(Date.now)。durationMs の計測起点。
    | { kind: "question"; shownAt: number }
    // previews は評価ごとの次回間隔の目安。履歴取得に失敗したときは undefined のまま評価だけ続行できる。
    | { kind: "answer"; shownAt: number; previews?: Record<QuizRating, number> };
  recordFailed: boolean;
}

type SessionState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty"; unscheduledCount: number }
  | { status: "active"; session: ActiveSession }
  | { status: "finished"; gradeCounts: Record<QuizRating, number>; unscheduledCount: number };

interface StudyReviewPageProps {
  mode?: ReviewMode;
  lawRepository?: LawRepository;
  storageRepository?: StorageRepository;
}

export const StudyReviewPage = ({
  mode = "due",
  lawRepository,
  // 本番ルーターは createAppRouter() を引数なしで呼ぶため、DI がないときは既定のリポジトリへフォールバックする。
  storageRepository = defaultStorageRepository,
}: StudyReviewPageProps = {}) => {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  // 読み込み失敗時の「再試行」で加算し、読み込み effect を再実行させる。
  const [reloadToken, setReloadToken] = useState(0);
  const { baseDate } = useBaseDate();
  const asOf = resolveAsOf(baseDate);
  // 同一法令のカードが続いても 1 回しか取得しないためのセッション内キャッシュ。
  // 取得に失敗した結果はキャッシュから外し、次のカードで再試行できるようにする。
  const documentCacheRef = useRef(new Map<string, Promise<LawViewerState>>());
  const loadDocument = useCallback(
    (lawId: string) => {
      const key = `${lawId}@${asOf ?? "current"}`;
      const cache = documentCacheRef.current;
      const cached = cache.get(key);

      if (cached !== undefined) {
        return cached;
      }

      const promise = loadLawViewerDocument(lawId, lawRepository, storageRepository, asOf)
        .then((document) => {
          if (document.status !== "ready") {
            cache.delete(key);
          }

          return document;
        })
        .catch((error: unknown) => {
          // ローダーは通常 reject しない設計だが、想定外の失敗をキャッシュに残さない。
          cache.delete(key);
          throw error;
        });

      cache.set(key, promise);

      return promise;
    },
    [asOf, lawRepository, storageRepository],
  );

  useEffect(() => {
    let isCurrent = true;

    const load = async () => {
      // due モードの空状態でも「新しく覚える」導線に未学習件数が要るため、両モードで先に引く。
      const unscheduled = await storageRepository.listUnscheduledStudyCards();
      const queue =
        mode === "new"
          ? unscheduled.slice(0, newCardsPerSession)
          : (await storageRepository.listDueStudyCards(new Date().toISOString())).map(
              (dueCard) => dueCard.card,
            );

      if (!isCurrent) {
        return;
      }

      if (queue.length === 0) {
        setState({ status: "empty", unscheduledCount: unscheduled.length });
        return;
      }

      const session: ActiveSession = {
        sessionId: generateStorageId(),
        startedAt: new Date().toISOString(),
        cardIds: queue.map((card) => card.id),
        queue,
        // 共有定数をそのまま持たず複製する。将来 gradeCounts の更新方法が変わっても定数が汚れないようにする。
        gradeCounts: { ...emptyGradeCounts },
        phase: { kind: "question", shownAt: Date.now() },
        recordFailed: false,
      };

      // セッションはメタデータにすぎない。保存に失敗しても復習は止めない(真実の源は ReviewLog)。
      void storageRepository
        .putStudySession({
          id: session.sessionId,
          startedAt: session.startedAt,
          cardIds: session.cardIds,
        })
        .catch(() => {
          // セッションメタデータの保存失敗は無視する。
        });

      setState({ status: "active", session });
    };

    load().catch(() => {
      if (isCurrent) {
        setState({ status: "error" });
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [mode, reloadToken, storageRepository]);

  const revealAnswer = useCallback(
    (session: ActiveSession) => {
      if (session.phase.kind !== "question") {
        return;
      }

      const card = session.queue[0];

      setState({
        status: "active",
        session: { ...session, phase: { kind: "answer", shownAt: session.phase.shownAt } },
      });

      // 次回間隔の目安は後追いで計算する。目安の表示だけなので、履歴取得に失敗しても評価は続行できる。
      storageRepository
        .listReviewLogs(card.id)
        .then((history) => {
          const previews = previewIntervals(history, card.id, new Date());

          setState((current) => {
            if (
              current.status !== "active" ||
              current.session.phase.kind !== "answer" ||
              current.session.queue[0]?.id !== card.id
            ) {
              return current;
            }

            return {
              status: "active",
              session: { ...current.session, phase: { ...current.session.phase, previews } },
            };
          });
        })
        .catch(() => {
          // 間隔プレビューの取得失敗は無視する(評価は続行できる)。
        });
    },
    [storageRepository],
  );

  const finishSession = useCallback(
    (session: ActiveSession, gradeCounts: Record<QuizRating, number>) => {
      const finished: StudySession = {
        id: session.sessionId,
        startedAt: session.startedAt,
        finishedAt: new Date().toISOString(),
        cardIds: session.cardIds,
      };

      // 完了記録もメタデータ扱い。保存に失敗しても完了画面は出す。
      void storageRepository.putStudySession(finished).catch(() => {
        // セッション完了メタデータの保存失敗は無視する。
      });

      // 完了画面の「新しく覚える」導線のために未学習件数を引き直す。失敗時は導線を出さないだけ。
      storageRepository
        .listUnscheduledStudyCards()
        .then((cards) => {
          setState({ status: "finished", gradeCounts, unscheduledCount: cards.length });
        })
        .catch(() => {
          setState({ status: "finished", gradeCounts, unscheduledCount: 0 });
        });
    },
    [storageRepository],
  );

  const gradeCard = useCallback(
    (session: ActiveSession, grade: QuizRating) => {
      if (session.phase.kind !== "answer") {
        return;
      }

      const card = session.queue[0];
      const log: ReviewLog = {
        id: generateStorageId(),
        cardId: card.id,
        sessionId: session.sessionId,
        grade,
        reviewedAt: new Date().toISOString(),
        durationMs: Date.now() - session.phase.shownAt,
        scheduler: fixedIntervalSchedulerId,
      };

      storageRepository
        .recordReview(log)
        .then((schedule) => {
          const gradeCounts = { ...session.gradeCounts, [grade]: session.gradeCounts[grade] + 1 };
          const queue = advanceQueue(session.queue, schedule.intervalDays);

          if (queue.length === 0) {
            finishSession(session, gradeCounts);
            return;
          }

          setState({
            status: "active",
            session: {
              ...session,
              queue,
              gradeCounts,
              phase: { kind: "question", shownAt: Date.now() },
              recordFailed: false,
            },
          });
        })
        .catch(() => {
          // ログは保存されていないので、同じ回答段階に留まれば二重記録にならない。
          setState({ status: "active", session: { ...session, recordFailed: true } });
        });
    },
    [finishSession, storageRepository],
  );

  // キーボード操作(Anki 互換): Space / Enter で答えを見る、1〜4 で評価。
  // フォーカス中のボタンの既定操作(Enter / Space の click 合成)と二重発火しないよう、body 起点のキーだけ扱う。
  useEffect(() => {
    if (state.status !== "active") {
      return;
    }

    const { session } = state;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target instanceof HTMLElement && event.target !== document.body)
      ) {
        return;
      }

      if (session.phase.kind === "question" && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        revealAnswer(session);
        return;
      }

      if (session.phase.kind === "answer") {
        const index = ["1", "2", "3", "4"].indexOf(event.key);

        if (index >= 0) {
          event.preventDefault();
          gradeCard(session, quizRatings[index]);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [gradeCard, revealAnswer, state]);

  const title = mode === "new" ? "新しく覚える" : "今日の復習";

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold text-foreground">{title}</h1>
        {state.status === "active" ? (
          <p className="text-sm text-muted-foreground">
            残り {String(state.session.queue.length)} 件
          </p>
        ) : null}
      </header>

      {state.status === "loading" ? <Skeleton className="h-48 w-full" /> : null}

      {state.status === "error" ? (
        <div className="grid justify-items-start gap-2">
          <p
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
            role="alert"
          >
            復習項目を読み込めませんでした。
          </p>
          <Button
            onClick={() => {
              setReloadToken((token) => token + 1);
            }}
            type="button"
            variant="outline"
          >
            再試行
          </Button>
        </div>
      ) : null}

      {state.status === "empty" ? (
        <div className="grid justify-items-start gap-2 rounded-md border bg-card p-4">
          {mode === "new" ? (
            <>
              <p className="text-sm leading-6 text-muted-foreground">
                未学習のカードがありません。
              </p>
              <Link
                className="text-sm text-primary underline-offset-4 hover:underline"
                to="/study/cards"
              >
                カード一覧を開く
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted-foreground">今日の復習はありません。</p>
              {state.unscheduledCount > 0 ? (
                <Link
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  search={{ mode: "new" }}
                  to="/study/review"
                >
                  新しく覚える（{String(state.unscheduledCount)} 件）
                </Link>
              ) : null}
            </>
          )}
          <Link className="text-sm text-primary underline-offset-4 hover:underline" to="/study">
            復習ホームへ戻る
          </Link>
        </div>
      ) : null}

      {state.status === "active" ? (
        <article className="grid gap-4 rounded-md border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{studyCardTypeLabels[state.session.queue[0].type]}</Badge>
          </div>
          <p className="whitespace-pre-wrap break-words text-lg font-semibold text-foreground">
            {state.session.queue[0].question}
          </p>
          {state.session.phase.kind === "question" ? (
            <Button
              onClick={() => {
                revealAnswer(state.session);
              }}
              type="button"
            >
              答えを見る
            </Button>
          ) : (
            // phase が "answer" であることを確定させてから previews を参照する。
            // 三項の else ブランチで kind を絞り込んでも、map コールバック内では
            // TypeScript が型文脈を引き継がないため、変数に取り出して絞り込む。
            (() => {
              const { previews } = state.session.phase;

              return (
                <>
                  <div className="grid gap-1 rounded-md bg-muted p-4">
                    <p className="text-xs font-medium text-muted-foreground">答え</p>
                    <p className="whitespace-pre-wrap break-words text-base text-foreground">
                      {state.session.queue[0].answer}
                    </p>
                    {state.session.queue[0].explanation === undefined ? null : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                        {state.session.queue[0].explanation}
                      </p>
                    )}
                  </div>
                  <StudyReviewEvidencePanel
                    key={state.session.queue[0].id}
                    card={state.session.queue[0]}
                    loadDocument={loadDocument}
                  />
                  {state.session.recordFailed ? (
                    <p
                      className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
                      role="alert"
                    >
                      回答を保存できませんでした。もう一度お試しください。
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {quizRatings.map((grade) => (
                      <Button
                        className="h-auto flex-col gap-0.5 py-2"
                        key={grade}
                        onClick={() => {
                          gradeCard(state.session, grade);
                        }}
                        type="button"
                        variant={grade === "again" ? "destructive" : "secondary"}
                      >
                        <span>{quizRatingLabels[grade]}</span>
                        {previews === undefined ? null : (
                          <span className="text-xs opacity-75">
                            {formatIntervalLabel(previews[grade])}
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                </>
              );
            })()
          )}
        </article>
      ) : null}

      {state.status === "finished" ? (
        <div className="grid justify-items-start gap-3 rounded-md border bg-card p-5">
          <p className="text-base font-semibold text-foreground">復習が完了しました</p>
          <ul className="grid gap-1 text-sm text-foreground">
            {quizRatings.map((grade) => (
              <li key={grade}>
                {quizRatingLabels[grade]}: {String(state.gradeCounts[grade])} 件
              </li>
            ))}
          </ul>
          {mode === "due" && state.unscheduledCount > 0 ? (
            <Link
              className="text-sm text-primary underline-offset-4 hover:underline"
              search={{ mode: "new" }}
              to="/study/review"
            >
              新しく覚える（{String(state.unscheduledCount)} 件）
            </Link>
          ) : null}
          <Link className="text-sm text-primary underline-offset-4 hover:underline" to="/study">
            復習ホームへ戻る
          </Link>
        </div>
      ) : null}
    </section>
  );
};
