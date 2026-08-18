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

// segments が空になるのは、共通の接頭辞・接尾辞が無く中間の LCS 計算も対象外
// （source と display の共通文字が皆無、または source.length * display.length が
// maxLcsCells を超える）だったとき。このとき toSourceOffset は劣化して
// bias="start" なら常に 0、bias="end" なら常に sourceLength を返すため、
// 「ノード全体が対応した」場合と見分けがつかない（非対称に、toDisplayRange は
// 同じ状況で undefined を返す）。呼び出し側は `alignment.segments.length === 0` を
// 見て、対応が取れなかった場合を自分で判別すること。
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
// alignment.segments が空（alignTexts のコメント参照）のときはループが一度も
// 回らず、末尾処理により bias="start" は 0、bias="end" は sourceLength を返す。
// これは「ノード全体が対応した」場合と同じ値になり区別できないので、
// 呼び出し側が事前に `alignment.segments.length === 0` を確認する必要がある。
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
      // どちらも source 内の位置だが、念のため sourceLength で頭打ちにする。
      return Math.min(
        alignment.sourceLength,
        bias === "start" ? previousSourceEnd : segment.sourceStart,
      );
    }

    const segmentDisplayEnd = segment.displayStart + segment.length;

    // 区間の終端ちょうどは次の区間との切れ目でもある。bias が "end" のときはここで
    // 確定させず、次の反復の隙間判定に委ねて外側（次区間の先頭）へ寄せる。
    if (clamped < segmentDisplayEnd || (clamped === segmentDisplayEnd && bias === "start")) {
      return segment.sourceStart + (clamped - segment.displayStart);
    }

    previousSourceEnd = segment.sourceStart + segment.length;
  }

  // 最後の一致区間より後ろの隙間。末尾の未対応領域を仮想の区間 (sourceLength, displayLength)
  // とみなし、中間の隙間と同じ規約で end は次の区間先頭（＝ source の終端）へ寄せる。
  // toDisplayEnd が末尾を displayLength まで広げるのと表裏で、往復しても置換語が落ちない。
  return Math.min(
    alignment.sourceLength,
    bias === "end" && previousSourceEnd < alignment.sourceLength
      ? alignment.sourceLength
      : previousSourceEnd,
  );
};

// 範囲の始端を display へ移す。どの区間にも属さない位置（置換の内側）は
// 手前の区間の display 末尾まで左へ広げ、置換された部分を取りこぼさないようにする。
const toDisplayStart = (alignment: TextAlignment, sourceOffset: number): number => {
  let previousDisplayEnd = 0;

  for (const segment of alignment.segments) {
    if (sourceOffset < segment.sourceStart) {
      return previousDisplayEnd;
    }

    if (sourceOffset < segment.sourceStart + segment.length) {
      return segment.displayStart + (sourceOffset - segment.sourceStart);
    }

    previousDisplayEnd = segment.displayStart + segment.length;
  }

  return previousDisplayEnd;
};

// 範囲の終端を display へ移す。区間の終端ちょうどは対応が取れているのでそのまま像を返し、
// 置換の内側に落ちたときだけ次の区間の display 先頭（末尾の置換なら display 末尾）まで広げる。
const toDisplayEnd = (alignment: TextAlignment, sourceOffset: number): number => {
  for (const segment of alignment.segments) {
    if (sourceOffset <= segment.sourceStart) {
      return segment.displayStart;
    }

    if (sourceOffset <= segment.sourceStart + segment.length) {
      return segment.displayStart + (sourceOffset - segment.sourceStart);
    }
  }

  return alignment.displayLength;
};

// source の範囲を display の範囲へ移す。置換をまたぐ場合は置換全体を覆うよう広げる。
// 対応区間が皆無なとき、および display 側で幅を持たない（削除された）範囲は undefined。
export const toDisplayRange = (
  alignment: TextAlignment,
  sourceStart: number,
  sourceEnd: number,
): { start: number; end: number } | undefined => {
  if (alignment.segments.length === 0) {
    return undefined;
  }

  const start = toDisplayStart(alignment, sourceStart);
  const end = toDisplayEnd(alignment, sourceEnd);

  return start >= end ? undefined : { start, end };
};
