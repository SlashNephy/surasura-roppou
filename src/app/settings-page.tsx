import { type ChangeEvent, type ReactNode, useId, useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  baseDateToStudyYear,
  earliestBaseDate,
  isDisplayFont,
  isDisplayFontSize,
  isDisplayLineSpacing,
  isDisplayTextMode,
  isDisplayTheme,
  isValidBaseDate,
  listSelectableStudyYears,
  studyYearToBaseDate,
} from "@/core/settings";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";

import { useBaseDate } from "./use-base-date";
import { useDisplayPreferences } from "./use-display-preferences";

interface SettingsRow {
  label: string;
  route?: "/settings/data-transfer";
  value: string;
}

interface SettingsGroup {
  heading: string;
  rows: SettingsRow[];
}

// 表示フォントの選択肢。value は display-preferences の DisplayFont と一致させる。
const displayFontOptions = [
  { value: "system", label: "システム標準" },
  { value: "noto-serif-jp", label: "Noto 明朝" },
  { value: "biz-udmincho", label: "BIZ UD 明朝" },
  { value: "zen-old-mincho", label: "ZEN オールド明朝" },
  { value: "noto-sans-jp", label: "Noto ゴシック" },
  { value: "biz-udgothic", label: "BIZ UD ゴシック" },
] as const;

// 本文フォントのプレビュー文。日本国憲法前文の冒頭で、選んだ書体の見え方をその場で確認する。
const lawFontPreviewText = "日本国民は、正当に選挙された国会における代表者を通じて行動し、";

// 表示設定と基準日以外はまだ静的表示のグループ。後続 issue で順次実体化する。
const staticGroups: SettingsGroup[] = [
  {
    heading: "データ",
    rows: [
      { label: "オフライン保存の管理", value: "準備中" },
      {
        label: "エクスポート / インポート",
        route: "/settings/data-transfer",
        value: "JSON ›",
      },
      { label: "ときどき六法と連携", value: "未接続" },
    ],
  },
];

const StaticSettingsGroup = ({ group }: { group: SettingsGroup }) => (
  <section className="grid gap-2">
    <h2 className="text-xs font-medium tracking-widest text-muted-foreground">{group.heading}</h2>
    <div className="divide-y rounded-md border bg-card">
      {group.rows.map((row) =>
        row.route === undefined ? (
          <div key={row.label} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-foreground">{row.label}</span>
            <span className="text-muted-foreground">{row.value}</span>
          </div>
        ) : (
          <Link
            className="flex items-center justify-between gap-4 px-4 py-3 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
            key={row.label}
            to={row.route}
          >
            <span className="text-foreground">{row.label}</span>
            <span className="shrink-0 text-muted-foreground">{row.value}</span>
          </Link>
        ),
      )}
    </div>
  </section>
);

const DisplaySelectRow = ({
  children,
  description,
  descriptionId,
  id,
  label,
}: {
  children: ReactNode;
  description?: string;
  descriptionId?: string;
  id: string;
  label: string;
}) => (
  <div className="grid min-w-0 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
    <label className="min-w-0 break-words font-medium text-foreground sm:pt-2" htmlFor={id}>
      {label}
    </label>
    <div className="grid min-w-0 gap-2">
      {children}
      {description === undefined ? null : (
        <p
          className="leading-display min-w-0 break-words text-xs text-muted-foreground"
          id={descriptionId}
        >
          {description}
        </p>
      )}
    </div>
  </div>
);

const DisplaySettingsGroup = () => {
  const {
    fontSize,
    lawFont,
    lineSpacing,
    setFontSize,
    setLawFont,
    setLineSpacing,
    setTextDisplayMode,
    setTheme,
    setUiFont,
    textDisplayMode,
    theme,
    uiFont,
  } = useDisplayPreferences();
  const fontSizeId = useId();
  const lawFontId = useId();
  const lawFontDescriptionId = useId();
  const lineSpacingId = useId();
  const textModeId = useId();
  const themeId = useId();
  const themeDescriptionId = useId();
  const uiFontId = useId();
  const uiFontDescriptionId = useId();

  const themeDescription = {
    system: "端末の外観設定に合わせます。",
    light: "端末の外観設定にかかわらずライトで表示します。",
    dark: "端末の外観設定にかかわらずダークで表示します。",
  }[theme];

  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-medium tracking-widest text-muted-foreground">表示</h2>
      <div className="divide-y rounded-md border bg-card">
        <DisplaySelectRow id={fontSizeId} label="文字サイズ">
          <Select
            className="w-full"
            id={fontSizeId}
            onChange={(event) => {
              if (isDisplayFontSize(event.target.value)) {
                setFontSize(event.target.value);
              }
            }}
            value={fontSize}
          >
            <option value="standard">標準</option>
            <option value="large">やや大きい</option>
            <option value="extra-large">大きい</option>
          </Select>
        </DisplaySelectRow>
        <DisplaySelectRow id={lineSpacingId} label="行間">
          <Select
            className="w-full"
            id={lineSpacingId}
            onChange={(event) => {
              if (isDisplayLineSpacing(event.target.value)) {
                setLineSpacing(event.target.value);
              }
            }}
            value={lineSpacing}
          >
            <option value="standard">標準</option>
            <option value="relaxed">ゆったり</option>
            <option value="wide">広い</option>
          </Select>
        </DisplaySelectRow>
        <DisplaySelectRow
          description="法令本文と目次に適用します。"
          descriptionId={lawFontDescriptionId}
          id={lawFontId}
          label="本文フォント"
        >
          <Select
            aria-describedby={lawFontDescriptionId}
            className="w-full"
            id={lawFontId}
            onChange={(event) => {
              if (isDisplayFont(event.target.value)) {
                setLawFont(event.target.value);
              }
            }}
            value={lawFont}
          >
            {displayFontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="font-law leading-display min-w-0 break-words text-sm text-foreground">
            {lawFontPreviewText}
          </p>
        </DisplaySelectRow>
        <DisplaySelectRow
          description="アプリ全体の画面表示に適用します。見出しの書体は変わりません。"
          descriptionId={uiFontDescriptionId}
          id={uiFontId}
          label="UI フォント"
        >
          <Select
            aria-describedby={uiFontDescriptionId}
            className="w-full"
            id={uiFontId}
            onChange={(event) => {
              if (isDisplayFont(event.target.value)) {
                setUiFont(event.target.value);
              }
            }}
            value={uiFont}
          >
            {displayFontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </DisplaySelectRow>
        <DisplaySelectRow
          description={themeDescription}
          descriptionId={themeDescriptionId}
          id={themeId}
          label="テーマ"
        >
          <Select
            aria-describedby={themeDescriptionId}
            className="w-full"
            id={themeId}
            onChange={(event) => {
              if (isDisplayTheme(event.target.value)) {
                setTheme(event.target.value);
              }
            }}
            value={theme}
          >
            <option value="system">システム</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </Select>
        </DisplaySelectRow>
        <DisplaySelectRow id={textModeId} label="既定の表示">
          <Select
            className="w-full"
            id={textModeId}
            onChange={(event) => {
              if (isDisplayTextMode(event.target.value)) {
                setTextDisplayMode(event.target.value);
              }
            }}
            value={textDisplayMode}
          >
            <option value="readable">読みやすい表示</option>
            <option value="original">原文表示</option>
          </Select>
        </DisplaySelectRow>
      </div>
    </section>
  );
};

export const SettingsPage = () => {
  const { baseDate, setBaseDate } = useBaseDate();
  const baseDateInputId = useId();
  const baseDateErrorId = useId();
  const studyYearSelectId = useId();
  const [error, setError] = useState<string | undefined>();
  // 入力欄はローカル状態でバッファする。範囲外など無効な値でもユーザーの入力を
  // 保持し、有効な値のときだけグローバル state を更新する（値の巻き戻りを防ぐ）。
  const [inputValue, setInputValue] = useState(baseDate ?? "");
  // 別タブなど外部から基準日が変わったら入力欄を追従させる。effect での setState を
  // 避けるため、前回同期した値と比較してレンダー中に同期する（React 公式の推奨形）。
  const [syncedBaseDate, setSyncedBaseDate] = useState(baseDate);
  if (baseDate !== syncedBaseDate) {
    setSyncedBaseDate(baseDate);
    setInputValue(baseDate ?? "");
  }

  // 年度セレクタの表示値は基準日から毎レンダー導出する（年度自体は永続化しない）。
  // 未設定 → "none"、有効な YYYY-04-01 → その年、それ以外の日付 → "custom"。
  const studyYear = baseDateToStudyYear(baseDate);
  const studyYearValue = baseDate === undefined ? "none" : (studyYear?.toString() ?? "custom");

  const handleStudyYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    // 「カスタム」は手動の日付入力への誘導ラベルであり、基準日は変更しない。
    if (value === "custom") {
      return;
    }

    if (value === "none") {
      setBaseDate(undefined);
      setError(undefined);
      return;
    }

    // 年度から導出した基準日は常に有効な日付なのでそのまま保存できる。
    setBaseDate(studyYearToBaseDate(Number(value)));
    setError(undefined);
  };

  const handleBaseDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputValue(value);

    if (value === "") {
      setBaseDate(undefined);
      setError(undefined);
      return;
    }

    if (!isValidBaseDate(value)) {
      setError(`基準日は ${earliestBaseDate} 以降を指定してください。`);
      return;
    }

    setError(undefined);
    setBaseDate(value);
  };

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-10">
      <h1 className="font-serif text-2xl font-semibold text-foreground">設定</h1>

      <DisplaySettingsGroup />

      <section className="grid gap-2">
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground">学習</h2>
        <div className="divide-y rounded-md border bg-card">
          <div className="grid gap-2 px-4 py-3 text-sm">
            <label htmlFor={studyYearSelectId} className="font-medium text-foreground">
              学習年度
            </label>
            <Select
              className="w-fit"
              id={studyYearSelectId}
              onChange={handleStudyYearChange}
              value={studyYearValue}
            >
              <option value="none">未設定（現行法）</option>
              {listSelectableStudyYears(new Date()).map((year) => (
                <option key={year} value={String(year)}>
                  {year} 年度
                </option>
              ))}
              <option value="custom">カスタム</option>
            </Select>
            <p className="text-xs leading-display text-muted-foreground">
              行政書士試験は例年、試験年の 4 月 1 日現在で施行されている法令が出題基準です。
            </p>
          </div>
          <div className="grid gap-2 px-4 py-3 text-sm">
            <label htmlFor={baseDateInputId} className="font-medium text-foreground">
              学習年度の基準日
            </label>
            <Input
              aria-describedby={error === undefined ? undefined : baseDateErrorId}
              aria-invalid={error === undefined ? undefined : true}
              className="w-fit"
              id={baseDateInputId}
              min={earliestBaseDate}
              onChange={handleBaseDateChange}
              type="date"
              value={inputValue}
            />
            <p className="text-xs leading-display text-muted-foreground">
              未設定のときは現行法（今日時点で施行）を表示します。
            </p>
            {error !== undefined ? (
              <p
                id={baseDateErrorId}
                role="alert"
                className="text-xs leading-display text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-foreground">科目プリセット</span>
            <span className="text-muted-foreground">行政書士（4 科目）</span>
          </div>
        </div>
      </section>

      <StaticSettingsGroup group={staticGroups[0]} />
    </section>
  );
};
