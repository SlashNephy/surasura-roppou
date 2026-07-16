import { useId, useState } from "react";

import { computeArticleFingerprint } from "@/core/domain";
import type { LawNode, StudyCardType } from "@/core/domain";
import { generateStorageId } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import { generateQuizCandidates } from "@/core/study";
import type { QuizCandidate } from "@/core/study";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";

import { studyCardTypeLabels } from "./study-card-form";

interface QuizGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lawId: string;
  lawTitle: string;
  revisionId: string;
  articleNumber: string;
  // アンカー先の条ノード。候補生成と指紋計算に使う。
  node: LawNode;
  // 同一法令の全ノード。項テキストの解決と条文番号当ての誤答選択に使う。
  nodes: readonly LawNode[];
  storageRepository: StorageRepository;
}

// 候補 1 件分の編集状態。candidate は生成結果の原本として保持し、編集は question / answer に持つ。
interface CandidateDraft {
  candidate: QuizCandidate;
  selected: boolean;
  question: string;
  answer: string;
}

// effect での候補生成はアンマウント後の setState やレース条件を生むため、
// open 中のみ内部コンポーネントをマウントし、useState 初期化子で同期生成する。
export const QuizGenerateDialog = ({
  open,
  onOpenChange,
  ...contentProps
}: QuizGenerateDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <QuizGenerateDialogContent onOpenChange={onOpenChange} {...contentProps} /> : null}
    </Dialog>
  );
};

interface QuizGenerateDialogContentProps extends Omit<
  QuizGenerateDialogProps,
  "open" | "onOpenChange"
> {
  onOpenChange: (open: boolean) => void;
}

const QuizGenerateDialogContent = ({
  onOpenChange,
  lawId,
  lawTitle,
  revisionId,
  articleNumber,
  node,
  nodes,
  storageRepository,
}: QuizGenerateDialogContentProps) => {
  // 初期化子で同期生成することで、初回レンダリングから正しい候補が表示される（フラッシュなし）。
  const [drafts, setDrafts] = useState<CandidateDraft[]>(() =>
    generateQuizCandidates(node, { lawTitle, nodes }).map((candidate) => ({
      candidate,
      selected: true,
      question: candidate.question,
      answer: candidate.answer,
    })),
  );
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const formId = useId();

  const selectedCount = drafts.filter((draft) => draft.selected).length;

  const updateDraft = (index: number, patch: Partial<CandidateDraft>) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)),
    );
  };

  const setAllSelected = (selected: boolean) => {
    setDrafts((current) => current.map((draft) => ({ ...draft, selected })));
  };

  const handleSave = async () => {
    const selectedDrafts = drafts.filter((draft) => draft.selected);

    if (
      selectedDrafts.some((draft) => draft.question.trim() === "" || draft.answer.trim() === "")
    ) {
      setError("選択中の候補に未入力の問題文または答えがあります。");
      return;
    }

    setIsSaving(true);
    setError(undefined);

    // 全カードが同じ条にアンカーされるため、指紋は 1 回だけ計算して使い回す。
    const fingerprint = await computeArticleFingerprint(node.plainText);
    const now = new Date().toISOString();
    const savedDrafts = new Set<CandidateDraft>();

    try {
      for (const draft of selectedDrafts) {
        await storageRepository.putStudyCard({
          id: generateStorageId(),
          source: "auto",
          target: { lawId, article: articleNumber, revisionId, fingerprint },
          type: draft.candidate.type,
          question: draft.question.trim(),
          answer: draft.answer.trim(),
          tags: [],
          examPinned: false,
          ...(draft.candidate.choices === undefined ? {} : { choices: draft.candidate.choices }),
          createdAt: now,
          updatedAt: now,
        });
        savedDrafts.add(draft);
      }

      onOpenChange(false);
    } catch {
      // 逐次保存のため途中失敗があり得る。保存済みの候補は一覧から取り除き、
      // 再試行したときに同じカードが二重保存されないようにする。
      setDrafts((current) => current.filter((draft) => !savedDrafts.has(draft)));
      setError(
        `${String(savedDrafts.size)} 件を保存した時点で保存に失敗しました。端末の保存領域を確認してください。`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 種別ごとのグループ。生成順（定義語 → 穴埋め → 条文番号当て → 正誤）を保つ。
  const groups: { type: StudyCardType; indexes: number[] }[] = [];

  drafts.forEach((draft, index) => {
    const group = groups.find((candidate) => candidate.type === draft.candidate.type);

    if (group === undefined) {
      groups.push({ type: draft.candidate.type, indexes: [index] });
    } else {
      group.indexes.push(index);
    }
  });

  return (
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>クイズカードを生成</DialogTitle>
        <DialogDescription>
          {lawTitle} {node.title ?? `第${articleNumber}条`} からの自動生成。候補を確認・編集して、
          残すものだけ保存してください。
        </DialogDescription>
      </DialogHeader>
      {drafts.length === 0 ? (
        <p className="text-sm leading-display text-muted-foreground">
          この条文からクイズ候補が見つかりませんでした。「カードを作る」から手動で作成できます。
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-8 px-3"
              onClick={() => {
                setAllSelected(true);
              }}
              type="button"
              variant="outline"
            >
              すべて選択
            </Button>
            <Button
              className="h-8 px-3"
              onClick={() => {
                setAllSelected(false);
              }}
              type="button"
              variant="outline"
            >
              すべて解除
            </Button>
          </div>
          {groups.map((group) => (
            <fieldset className="grid gap-3" key={group.type}>
              {/* legend が fieldset のアクセシブルネームになる。見出しとしても辿れるよう h3 を包む。 */}
              <legend className="float-left w-full">
                <h3 className="text-sm font-semibold text-foreground">
                  {studyCardTypeLabels[group.type]}
                </h3>
              </legend>
              {group.indexes.map((index) => {
                const draft = drafts[index];

                return (
                  <div
                    className="grid gap-2 rounded-md border bg-card p-3"
                    key={`${draft.candidate.ruleId}:${String(index)}`}
                  >
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        checked={draft.selected}
                        className="size-4 accent-primary"
                        onChange={(event) => {
                          updateDraft(index, { selected: event.target.checked });
                        }}
                        type="checkbox"
                      />
                      保存する
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-foreground">
                      問題文
                      <Textarea
                        onChange={(event) => {
                          updateDraft(index, { question: event.target.value });
                        }}
                        value={draft.question}
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-foreground">
                      答え
                      <Textarea
                        onChange={(event) => {
                          updateDraft(index, { answer: event.target.value });
                        }}
                        value={draft.answer}
                      />
                    </label>
                    {draft.candidate.choices === undefined ? null : (
                      <div className="grid gap-1 text-sm">
                        <span className="font-medium text-foreground">選択肢</span>
                        <ul className="list-disc pl-5 text-muted-foreground">
                          {draft.candidate.choices.map((choice) => (
                            <li key={choice}>{choice}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      )}
      {error === undefined ? null : (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-display text-destructive"
          id={`${formId}-error`}
          role="alert"
        >
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          onClick={() => {
            onOpenChange(false);
          }}
          type="button"
          variant="outline"
        >
          キャンセル
        </Button>
        {drafts.length === 0 ? null : (
          <Button
            aria-describedby={error === undefined ? undefined : `${formId}-error`}
            disabled={isSaving || selectedCount === 0}
            onClick={() => {
              void handleSave();
            }}
            type="button"
          >
            選択した {selectedCount} 件を保存
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
};
