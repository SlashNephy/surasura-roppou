export interface AlignmentSegment {
  sourceStart: number;
  displayStart: number;
  length: number;
}

// source 側と display 側の対応区間の列。区間内は 1 対 1 対応（等長）で、
// 区間の切れ目が挿入・削除・置換の境界になる。区間は開始位置の昇順。
export interface TextAlignment {
  segments: AlignmentSegment[];
  sourceLength: number;
  displayLength: number;
}

// 中間部の LCS が現実的な計算量に収まる上限。条文 1 ノードの本文は通常数百文字で、
// 差分のある中間はそのごく一部にしかならない。超えた場合は対応なしとして扱い、
// ハイライトを描かずに劣化させる。
const maxLcsCells = 1_000_000;

export const commonPrefixLength = (a: string, b: string): number => {
  const limit = Math.min(a.length, b.length);
  let index = 0;

  while (index < limit && a[index] === b[index]) {
    index += 1;
  }

  return index;
};

export const commonSuffixLength = (a: string, b: string): number => {
  const limit = Math.min(a.length, b.length);
  let index = 0;

  while (index < limit && a[a.length - 1 - index] === b[b.length - 1 - index]) {
    index += 1;
  }

  return index;
};

// 中間部の最長共通部分列を求め、連続する一致を 1 区間にまとめて返す。
const lcsSegments = (
  source: string,
  display: string,
  sourceOffset: number,
  displayOffset: number,
): AlignmentSegment[] => {
  if (source === "" || display === "" || source.length * display.length > maxLcsCells) {
    return [];
  }

  const width = display.length + 1;
  const table = new Uint32Array((source.length + 1) * width);

  for (let i = source.length - 1; i >= 0; i -= 1) {
    for (let j = display.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        source[i] === display[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const segments: AlignmentSegment[] = [];
  let i = 0;
  let j = 0;

  while (i < source.length && j < display.length) {
    if (source[i] === display[j]) {
      const last = segments.at(-1);

      if (
        last !== undefined &&
        last.sourceStart + last.length === sourceOffset + i &&
        last.displayStart + last.length === displayOffset + j
      ) {
        last.length += 1;
      } else {
        segments.push({
          sourceStart: sourceOffset + i,
          displayStart: displayOffset + j,
          length: 1,
        });
      }

      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return segments;
};

// 末尾の区間に連続していれば伸ばし、そうでなければ新しい区間として足す。
const pushSegment = (segments: AlignmentSegment[], segment: AlignmentSegment): void => {
  const last = segments.at(-1);

  if (
    last !== undefined &&
    last.sourceStart + last.length === segment.sourceStart &&
    last.displayStart + last.length === segment.displayStart
  ) {
    last.length += segment.length;

    return;
  }

  segments.push(segment);
};

export const alignTexts = (source: string, display: string): TextAlignment => {
  const prefix = commonPrefixLength(source, display);
  const suffix = Math.min(
    commonSuffixLength(source, display),
    Math.min(source.length, display.length) - prefix,
  );
  const segments: AlignmentSegment[] = [];

  if (prefix > 0) {
    segments.push({ sourceStart: 0, displayStart: 0, length: prefix });
  }

  const middle = lcsSegments(
    source.slice(prefix, source.length - suffix),
    display.slice(prefix, display.length - suffix),
    prefix,
    prefix,
  );

  for (const segment of middle) {
    pushSegment(segments, segment);
  }

  if (suffix > 0) {
    pushSegment(segments, {
      sourceStart: source.length - suffix,
      displayStart: display.length - suffix,
      length: suffix,
    });
  }

  return { segments, sourceLength: source.length, displayLength: display.length };
};

// display のオフセットを source のオフセットへ移す。
// 対応の切れ目に落ちたときは bias に従って外側へ寄せ、置換された語をまるごと覆う。
export const toSourceOffset = (
  alignment: TextAlignment,
  displayOffset: number,
  bias: "end" | "start",
): number => {
  const clamped = Math.max(0, Math.min(displayOffset, alignment.displayLength));
  let previousSourceEnd = 0;

  for (const segment of alignment.segments) {
    if (clamped < segment.displayStart) {
      // 区間と区間の隙間。start は手前の区間末尾へ、end は次の区間先頭へ寄せる。
      return bias === "start" ? previousSourceEnd : segment.sourceStart;
    }

    const segmentDisplayEnd = segment.displayStart + segment.length;

    // 区間の終端ちょうどは次の区間との切れ目でもある。bias が "end" のときはここで
    // 確定させず、次の反復の隙間判定に委ねて外側（次区間の先頭）へ寄せる。
    if (clamped < segmentDisplayEnd || (clamped === segmentDisplayEnd && bias === "start")) {
      return segment.sourceStart + (clamped - segment.displayStart);
    }

    previousSourceEnd = segmentDisplayEnd;
  }

  return Math.min(alignment.sourceLength, previousSourceEnd);
};

// source の範囲を display の範囲へ移す。置換をまたぐ場合は置換全体を覆うよう広げる。
export const toDisplayRange = (
  alignment: TextAlignment,
  sourceStart: number,
  sourceEnd: number,
): { start: number; end: number } | undefined => {
  let start: number | undefined;
  let end: number | undefined;

  for (const segment of alignment.segments) {
    const segmentSourceEnd = segment.sourceStart + segment.length;

    if (segmentSourceEnd <= sourceStart || segment.sourceStart >= sourceEnd) {
      continue;
    }

    const overlapStart = Math.max(segment.sourceStart, sourceStart);
    const overlapEnd = Math.min(segmentSourceEnd, sourceEnd);
    const displayStart = segment.displayStart + (overlapStart - segment.sourceStart);
    const displayEnd = segment.displayStart + (overlapEnd - segment.sourceStart);

    start = start === undefined ? displayStart : Math.min(start, displayStart);
    end = end === undefined ? displayEnd : Math.max(end, displayEnd);
  }

  return start === undefined || end === undefined || start >= end ? undefined : { start, end };
};
