import { Fragment, useMemo } from "react";

import type { RubyAnnotation } from "@/core/domain";

interface LawTextWithRubyProps {
  text: string;
  annotations?: RubyAnnotation[];
}

interface LawTextSegment {
  text: string;
  ruby?: string;
}

/**
 * 本文テキストにルビ（<ruby>）を復元して描画する。
 * 原文の位置情報は保持していないため、そのノードに現れるルビ対象語をすべて注記する。
 * 同じ語には同じ読みが付くので、原文より注記が増えても読みとしては正しい。
 */
export const LawTextWithRuby = ({ annotations, text }: LawTextWithRubyProps) => {
  const segments = useMemo(() => splitLawTextByRuby(text, annotations), [text, annotations]);

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
): LawTextSegment[] => {
  if (annotations === undefined || annotations.length === 0 || text === "") {
    return [{ text }];
  }

  // 長い語を先に並べ、短い語が長い語の一部を先に食わないようにする。
  const sorted = [...annotations].sort((left, right) => right.base.length - left.base.length);
  const rubyByBase = new Map(sorted.map((annotation) => [annotation.base, annotation.text]));
  const pattern = new RegExp(`(${sorted.map((a) => escapeRegExp(a.base)).join("|")})`, "g");

  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => {
      const ruby = rubyByBase.get(part);

      return ruby === undefined ? { text: part } : { text: part, ruby };
    });
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
