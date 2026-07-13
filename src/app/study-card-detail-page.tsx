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
  // lawTitle: listSavedLaws() で lawId から解決した法令名。未保存の場合は lawId をそのまま使う。
  | { status: "ready"; card: StudyCard; lawTitle: string };

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
  // 削除処理の実行中フラグ。isSaving に対応する削除側の状態。
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([storageRepository.getStudyCard(cardId), storageRepository.listSavedLaws()])
      .then(([loadedCard, savedLaws]) => {
        if (!isCurrent) {
          return;
        }

        if (loadedCard === undefined) {
          setState({ status: "not-found" });
          return;
        }

        // 保存済み法令から lawId に対応する法令名を引く。未保存の場合は lawId をそのまま表示する。
        const savedLaw = savedLaws.find((law) => law.law.lawId === loadedCard.target.lawId);
        const lawTitle = savedLaw?.law.title ?? loadedCard.target.lawId;

        setState({ status: "ready", card: loadedCard, lawTitle });
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

  const { card, lawTitle } = state;

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
      // 保存後も lawTitle は変わらないため現在の state から引き継ぐ。
      setState({ status: "ready", card: updated, lawTitle });
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
    setIsDeleting(true);

    try {
      await storageRepository.deleteStudyCard(card.id);
      // 遷移によるアンマウントより先にダイアログを閉じ、scroll lock の解放を確実にする。
      setIsDeleteDialogOpen(false);
      await navigate({ to: "/study/cards" });
    } catch {
      setIsDeleteDialogOpen(false);
      setMessage({
        kind: "error",
        text: "カードを削除できませんでした。端末の保存領域を確認してください。",
      });
    } finally {
      // 成功時は navigate で画面を離脱するため実質的に意味はないが、
      // isSaving の finally パターンと統一するために記述する。
      setIsDeleting(false);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-2xl font-semibold text-foreground">条文カード</h1>
        <p className="text-sm text-muted-foreground">
          根拠:{" "}
          {/* ビューア起点の作成フローでは article が必ず入るが、
              データ不整合時に「第null条」がレンダリングされるのを防ぐため
              article が空の場合は条番号部分を省略して法令名のみ表示する。 */}
          <Link
            className="text-primary underline-offset-4 hover:underline"
            params={{ lawId: card.target.lawId, article: card.target.article ?? "" }}
            to="/laws/$lawId/articles/$article"
          >
            {lawTitle}
            {card.target.article === null ||
            card.target.article === undefined ||
            card.target.article === ""
              ? ""
              : ` 第${card.target.article}条`}
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
        {card.choices === undefined || card.choices.length === 0 ? null : (
          <div className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">選択肢</span>
            {/* 自動生成カードの選択肢。編集は対象外（確定済み設計 6.3）のため読み取り専用で表示する。 */}
            <ul className="list-disc pl-5 leading-6 text-muted-foreground">
              {card.choices.map((choice) => (
                <li key={choice}>{choice}</li>
              ))}
            </ul>
          </div>
        )}
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
              disabled={isDeleting}
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
