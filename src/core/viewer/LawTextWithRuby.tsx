import { Fragment, useMemo } from "react";

import type { RubyAnnotation } from "@/core/domain";

import { applyLawTextDisplayMode, type LawTextDisplayMode } from "./displayMode";

interface LawTextWithRubyProps {
  text: string;
  annotations?: RubyAnnotation[];
  displayMode?: LawTextDisplayMode;
}

interface LawTextSegment {
  text: string;
  ruby?: string;
}

/**
 * 本文テキストにルビ（<ruby>）を復元して描画する。
 * 原文中の出現位置は保持していないため、そのノードに現れるルビ対象語をすべて注記する。
 * 同じ語には同じ読みが付くので、原文より注記が増えても読みとしては正しい。
 */
export const LawTextWithRuby = ({ annotations, displayMode, text }: LawTextWithRubyProps) => {
  const segments = useMemo(
    () => splitLawTextByRuby(text, annotations, displayMode),
    [text, annotations, displayMode],
  );

  return (
    <>
      {segments.map((segment, index) =>
        segment.ruby === undefined ? (
          <Fragment key={`${String(index)}:${segment.text}`}>{segment.text}</Fragment>
        ) : (
          <ruby key={`${String(index)}:${segment.text}`}>
            {segment.text}
            <rt>{segment.ruby}</rt>
          </ruby>
        ),
      )}
    </>
  );
};

const splitLawTextByRuby = (
  text: string,
  annotations: RubyAnnotation[] | undefined,
  displayMode: LawTextDisplayMode | undefined,
): LawTextSegment[] => {
  const rubyByBase = buildRubyByBase(annotations, displayMode);

  if (text === "" || rubyByBase.size === 0) {
    return [{ text }];
  }

  // 長い語を先に並べ、短い語が長い語の一部を先に食わないようにする。
  const bases = [...rubyByBase.keys()].sort((left, right) => right.length - left.length);
  const pattern = new RegExp(`(${bases.map(escapeRegExp).join("|")})`, "g");

  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => {
      const ruby = rubyByBase.get(part);

      return ruby === undefined ? { text: part } : { text: part, ruby };
    });
};

const buildRubyByBase = (
  annotations: RubyAnnotation[] | undefined,
  displayMode: LawTextDisplayMode | undefined,
): Map<string, string> => {
  const rubyByBase = new Map<string, string>();

  if (annotations === undefined) {
    return rubyByBase;
  }

  // 読める化モードでは本文が変換済みなので、注記側も同じ変換を通してから突き合わせる。
  const ambiguousBases = new Set<string>();

  for (const annotation of annotations) {
    if (annotation.base === "" || annotation.text === "") {
      continue;
    }

    const base =
      displayMode === undefined
        ? annotation.base
        : applyLawTextDisplayMode(annotation.base, displayMode);
    const registered = rubyByBase.get(base);

    // 同じ語に別の読みがある場合はどちらとも決められないので、ルビを付けない。
    if (registered !== undefined && registered !== annotation.text) {
      ambiguousBases.add(base);
      continue;
    }

    rubyByBase.set(base, annotation.text);
  }

  for (const base of ambiguousBases) {
    rubyByBase.delete(base);
  }

  return rubyByBase;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
