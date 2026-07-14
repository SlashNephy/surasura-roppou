import { earliestBaseDate, isValidBaseDate } from "./base-date";

// 行政書士試験は例年「試験年の 4 月 1 日現在施行の法令」が出題基準（設計 2026-07-14 の 4 章）。
// 学習年度は基準日の導出ビューであり、このモジュールは純関数のみで年度自体を永続化しない。

// 選択できる最古の学習年度。e-Gov の asof 下限（earliestBaseDate = 2017-04-01）に対応する。
const earliestStudyYear = Number(earliestBaseDate.slice(0, 4));

export const studyYearToBaseDate = (year: number): string => `${String(year)}-04-01`;

// 基準日が「有効な YYYY-04-01」のときだけ年度とみなす。それ以外（未設定・任意日付・
// e-Gov 下限より前）は undefined = カスタム扱い。
export const baseDateToStudyYear = (baseDate: string | undefined): number | undefined => {
  if (baseDate === undefined || !isValidBaseDate(baseDate)) {
    return undefined;
  }

  if (!baseDate.endsWith("-04-01")) {
    return undefined;
  }

  return Number(baseDate.slice(0, 4));
};

// 年内の試験終了後に翌年度の学習を始めるユーザーを想定し、上限は「today の年 + 1」。
// 設定 UI で新しい年度が上に来るよう降順で返す。
export const listSelectableStudyYears = (today: Date): number[] => {
  const latestStudyYear = today.getFullYear() + 1;
  const years: number[] = [];

  for (let year = latestStudyYear; year >= earliestStudyYear; year -= 1) {
    years.push(year);
  }

  return years;
};
