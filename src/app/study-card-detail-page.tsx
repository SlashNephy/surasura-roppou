import { type SyntheticEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import type { StudyCard, StudyCardType } from "@/core/domain";
import { createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
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
import { Select } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { Textarea } from "@/shared/ui/textarea";

import { parseTagsInput, studyCardTypeLabels } from "./study-card-form";

const defaultStorageRepository = createStorageRepository();

type DetailState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ready"; card: StudyCard };

interface StudyCardDetailPageProps {
  storageRepository?: StorageRepository;
}

export const StudyCardDetailPage = ({
  storageRepository = defaultStorageRepository,
}: StudyCardDetailPageProps = {}) => {
  const { cardId } = useParams({ from: "/study/cards/$cardId" });
  const navigate = useNavigate();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [type, setType] = useState<StudyCardType>("fill_blank");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [examPinned, setExamPinned] = useState(false);
  const [message, setMessage] = useState<{ kind: "saved" | "error"; text: string }>();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void storageRepository
      .getStudyCard(cardId)
      .then((loadedCard) => {
        if (!isCurrent) {
          return;
        }

        if (loadedCard === undefined) {
          setState({ status: "not-found" });
          return;
        }

        setState({ status: "ready", card: loadedCard });
        setType(loadedCard.type);
        setQuestion(loadedCard.question);
        setAnswer(loadedCard.answer);
        setExplanation(loadedCard.explanation ?? "");
        setTagsInput(loadedCard.tags.join(", "));
        setExamPinned(loadedCard.examPinned);
      })
      .catch(() => {
        if (isCurrent) {
          setState({ status: "error" });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [cardId, storageRepository]);

  if (state.status === "loading") {
    return (
      <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  if (state.status === "not-found") {
    return (
      <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
        <h1 className="font-serif text-2xl font-semibold text-foreground">条文カード</h1>
        <p className="text-sm leading-6 text-muted-foreground">カードが見つかりません。</p>
        <Link className="text-primary underline-offset-4 hover:underline" to="/study/cards">
          一覧へ戻る
        </Link>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
        <h1 className="font-serif text-2xl font-semibold text-foreground">条文カード</h1>
        <p
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
          role="alert"
        >
          カードを読み込めませんでした。ページを再読み込みしてください。
        </p>
      </section>
    );
  }

  const { card } = state;

  // React 19 では FormEvent が deprecated になったため SyntheticEvent を使う。
  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();

    if (trimmedQuestion === "" || trimmedAnswer === "") {
      setMessage({ kind: "error", text: "問題文と答えを入力してください。" });
      return;
    }

    setIsSaving(true);
    setMessage(undefined);

    try {
      const trimmedExplanation = explanation.trim();
      const updated: StudyCard = {
        ...card,
        type,
        question: trimmedQuestion,
        answer: trimmedAnswer,
        explanation: trimmedExplanation === "" ? undefined : trimmedExplanation,
        tags: parseTagsInput(tagsInput),
        examPinned,
        updatedAt: new Date().toISOString(),
      };

      await storageRepository.putStudyCard(updated);
      setState({ status: "ready", card: updated });
      setMessage({ kind: "saved", text: "保存しました。" });
    } catch {
      setMessage({
        kind: "error",
        text: "カードを保存できませんでした。端末の保存領域を確認してください。",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await storageRepository.deleteStudyCard(card.id);
      await navigate({ to: "/study/cards" });
    } catch {
      setIsDeleteDialogOpen(false);
      setMessage({
        kind: "error",
        text: "カードを削除できませんでした。端末の保存領域を確認してください。",
      });
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-2xl font-semibold text-foreground">条文カード</h1>
        <p className="text-sm text-muted-foreground">
          根拠:{" "}
          <Link
            className="text-primary underline-offset-4 hover:underline"
            params={{ lawId: card.target.lawId, article: card.target.article ?? "" }}
            to="/laws/$lawId/articles/$article"
          >
            {card.target.lawId} 第{card.target.article}条
          </Link>
        </p>
      </header>

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label className="grid gap-1 text-sm font-medium text-foreground">
          種別
          <Select
            onChange={(event) => {
              setType(event.target.value as StudyCardType);
            }}
            value={type}
          >
            {Object.entries(studyCardTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          問題文
          <Textarea
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
            value={question}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          答え
          <Textarea
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
            value={answer}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          解説（任意）
          <Textarea
            onChange={(event) => {
              setExplanation(event.target.value);
            }}
            value={explanation}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-foreground">
          タグ（カンマ区切り、任意）
          <Input
            onChange={(event) => {
              setTagsInput(event.target.value);
            }}
            value={tagsInput}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            checked={examPinned}
            className="size-4 accent-primary"
            onChange={(event) => {
              setExamPinned(event.target.checked);
            }}
            type="checkbox"
          />
          試験直前に確認
        </label>

        {message === undefined ? null : (
          <p
            className={
              message.kind === "error"
                ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
                : "rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 text-foreground"
            }
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            onClick={() => {
              setIsDeleteDialogOpen(true);
            }}
            type="button"
            variant="outline"
          >
            カードを削除
          </Button>
          <Button disabled={isSaving} type="submit">
            変更を保存
          </Button>
        </div>
      </form>

      <Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>カードを削除しますか？</DialogTitle>
            <DialogDescription>
              このカードの回答履歴と復習予定も一緒に削除されます。元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsDeleteDialogOpen(false);
              }}
              type="button"
              variant="outline"
            >
              キャンセル
            </Button>
            <Button
              onClick={() => {
                void handleDelete();
              }}
              type="button"
              variant="destructive"
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
