import { useCallback, useEffect, useState } from "react";

import type { Annotation, HighlightColor, LawNode, LawReferenceTarget } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import { generateStorageId } from "@/core/storage";
import {
  applyHighlight,
  createTextQuoteAnchor,
  type HighlightRange,
  resolveTextQuoteAnchor,
} from "@/core/viewer";

interface HighlightMutationInput {
  annotations: Annotation[];
  node: LawNode;
  target: LawReferenceTarget;
  range: { start: number; end: number };
  color: HighlightColor;
  now: string;
  nextId: () => string;
}

interface HighlightMutations {
  puts: Annotation[];
  deletes: string[];
}

// 対象ノードに属し、いまも本文中に解決できる注釈だけを交差判定の対象にする。
const collectNodeRanges = (
  annotations: Annotation[],
  node: LawNode,
): { ranges: HighlightRange[]; byId: Map<string, Annotation> } => {
  const ranges: HighlightRange[] = [];
  const byId = new Map<string, Annotation>();

  for (const annotation of annotations) {
    const color = annotation.color;
    // anchors は空になりうる。`[0]` は型上 undefined にならないため at() で受ける。
    const anchor = annotation.anchors.at(0);

    if (color === undefined || anchor?.target.path !== node.path) {
      continue;
    }

    const resolved = resolveTextQuoteAnchor(node.plainText, anchor);

    if (resolved === undefined) {
      continue;
    }

    ranges.push({ annotationId: annotation.id, color, ...resolved });
    byId.set(annotation.id, annotation);
  }

  return { ranges, byId };
};

export const buildHighlightMutations = ({
  annotations,
  color,
  node,
  nextId,
  now,
  range,
  target,
}: HighlightMutationInput): HighlightMutations => {
  const { byId, ranges } = collectNodeRanges(annotations, node);
  const result = applyHighlight(ranges, { ...range, color });
  const anchorTarget: LawReferenceTarget = { ...target, path: node.path };
  const puts: Annotation[] = [];

  for (const updated of result.updated) {
    const source = byId.get(updated.annotationId);

    if (source === undefined) {
      continue;
    }

    puts.push({
      ...source,
      color: updated.color,
      anchors: [
        {
          target: anchorTarget,
          ...createTextQuoteAnchor(node.plainText, updated.start, updated.end),
        },
      ],
      updatedAt: now,
    });
  }

  for (const created of result.created) {
    const source =
      created.sourceAnnotationId === undefined ? undefined : byId.get(created.sourceAnnotationId);

    puts.push({
      id: nextId(),
      target: anchorTarget,
      anchors: [
        {
          target: anchorTarget,
          ...createTextQuoteAnchor(node.plainText, created.start, created.end),
        },
      ],
      color: created.color,
      // 分割で生じた断片は元のメモとタグを引き継ぐ。片方だけ消せる方が自然なため複製する。
      ...(source?.note === undefined ? {} : { note: source.note }),
      tags: source?.tags ?? [],
      createdAt: source?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return { puts, deletes: result.deleted };
};

interface ArticleHighlightsOptions {
  lawId: string;
  nodes: LawNode[];
  repository: StorageRepository;
  enabled: boolean;
}

interface HighlightInput {
  lawNodeId: string;
  range: { start: number; end: number };
  color: HighlightColor;
  target: LawReferenceTarget;
}

// 無効時に返す不変の空配列。レンダーごとに新しい配列を作ると、これを依存に取る
// 描画 hook の effect が毎回動いてしまう。
const noAnnotations: Annotation[] = [];

export const useArticleHighlights = ({
  enabled,
  lawId,
  nodes,
  repository,
}: ArticleHighlightsOptions) => {
  const [loaded, setLoaded] = useState<Annotation[]>(noAnnotations);
  // 無効時は state を空へ戻すのではなく描画時に導出する。effect の同期パスで
  // setState すると連鎖レンダーになる（react-hooks/set-state-in-effect）。
  const annotations = enabled ? loaded : noAnnotations;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    void repository
      .listAnnotations({ lawId })
      .then((records) => {
        if (!cancelled) {
          setLoaded(records.filter((record) => record.color !== undefined));
        }
      })
      .catch(() => {
        // 読み込みに失敗しても本文は読めるようにする。ハイライトだけ諦める。
        if (!cancelled) {
          setLoaded(noAnnotations);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, lawId, repository]);

  const highlight = useCallback(
    async (input: HighlightInput) => {
      const node = nodes.find((candidate) => candidate.id === input.lawNodeId);

      if (node === undefined) {
        return;
      }

      const mutations = buildHighlightMutations({
        annotations,
        node,
        target: input.target,
        range: input.range,
        color: input.color,
        now: new Date().toISOString(),
        nextId: generateStorageId,
      });

      await Promise.all([
        ...mutations.puts.map((annotation) => repository.putAnnotation(annotation)),
        ...mutations.deletes.map((id) => repository.deleteAnnotation(id)),
      ]);

      setLoaded((current) => {
        const replaced = new Set([
          ...mutations.deletes,
          ...mutations.puts.map((annotation) => annotation.id),
        ]);

        return [...current.filter((annotation) => !replaced.has(annotation.id)), ...mutations.puts];
      });
    },
    [annotations, nodes, repository],
  );

  const remove = useCallback(
    async (annotationId: string) => {
      await repository.deleteAnnotation(annotationId);
      setLoaded((current) => current.filter((annotation) => annotation.id !== annotationId));
    },
    [repository],
  );

  return { annotations, highlight, remove };
};
