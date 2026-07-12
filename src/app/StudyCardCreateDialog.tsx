import { type SyntheticEvent, useId, useState } from "react";

import { computeArticleFingerprint } from "@/core/domain";
import type { LawNode, StudyCardType } from "@/core/domain";
import { generateStorageId } from "@/core/storage";
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
import { Textarea } from "@/shared/ui/textarea";

import { parseTagsInput, studyCardTypeLabels } from "./study-card-form";

interface StudyCardCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lawId: string;
  lawTitle: string;
  revisionId: string;
  articleNumber: string;
  // アンカー先の条ノード。指紋計算と見出し表示に使う。
  node: LawNode;
  storageRepository: StorageRepository;
}

export const StudyCardCreateDialog = ({
  open,
  onOpenChange,
  lawId,
  lawTitle,
  revisionId,
  articleNumber,
  node,
  storageRepository,
}: StudyCardCreateDialogProps) => {
  const [type, setType] = useState<StudyCardType>("fill_blank");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const formId = useId();

  const resetForm = () => {
    setType("fill_blank");
    setQuestion("");
    setAnswer("");
    setExplanation("");
    setTagsInput("");
    setError(undefined);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();

    if (trimmedQuestion === "" || trimmedAnswer === "") {
      setError("問題文と答えを入力してください。");
      return;
    }

    setIsSaving(true);
    setError(undefined);

    try {
      // ブックマークと同じ二重アンカー + 指紋でカードを条文に固定する。
      const fingerprint = await computeArticleFingerprint(node.plainText);
      const now = new Date().toISOString();
      const trimmedExplanation = explanation.trim();

      await storageRepository.putStudyCard({
        id: generateStorageId(),
        source: "manual",
        target: { lawId, article: articleNumber, revisionId, fingerprint },
        type,
        question: trimmedQuestion,
        answer: trimmedAnswer,
        explanation: trimmedExplanation === "" ? undefined : trimmedExplanation,
        tags: parseTagsInput(tagsInput),
        examPinned: false,
        createdAt: now,
        updatedAt: now,
      });
      handleOpenChange(false);
    } catch {
      setError("カードを保存できませんでした。端末の保存領域を確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  // 閉じるときは途中入力を破棄する。別の条文で開き直したとき前回の入力が混ざるのを防ぐ。
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>学習カードを作る</DialogTitle>
          <DialogDescription>
            {lawTitle} {node.title ?? `第${articleNumber}条`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <label className="grid gap-1 text-sm font-medium text-foreground">
            種別
            <Select
              name="type"
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
              name="question"
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
              placeholder="例: 私権は、（　　）に適合しなければならない。"
              value={question}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-foreground">
            答え
            <Textarea
              name="answer"
              onChange={(event) => {
                setAnswer(event.target.value);
              }}
              value={answer}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-foreground">
            解説（任意）
            <Textarea
              name="explanation"
              onChange={(event) => {
                setExplanation(event.target.value);
              }}
              value={explanation}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-foreground">
            タグ（カンマ区切り、任意）
            <Input
              name="tags"
              onChange={(event) => {
                setTagsInput(event.target.value);
              }}
              placeholder="例: 民法, 総則"
              value={tagsInput}
            />
          </label>
          {error === undefined ? null : (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
              id={`${formId}-error`}
              role="alert"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                handleOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              キャンセル
            </Button>
            <Button
              aria-describedby={error === undefined ? undefined : `${formId}-error`}
              disabled={isSaving}
              type="submit"
            >
              カードを保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
