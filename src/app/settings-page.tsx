import { type ChangeEvent, useId, useState } from "react";

import { earliestBaseDate, isValidBaseDate } from "@/core/settings";
import { Input } from "@/shared/ui/input";

import { useBaseDate } from "./use-base-date";

interface SettingsRow {
  label: string;
  value: string;
}

interface SettingsGroup {
  heading: string;
  rows: SettingsRow[];
}

// 基準日以外はまだ静的表示のグループ。後続 issue で順次実体化する。
const staticGroups: SettingsGroup[] = [
  {
    heading: "表示",
    rows: [
      { label: "文字サイズ", value: "標準" },
      { label: "行間", value: "ゆったり" },
      { label: "テーマ", value: "自動" },
      { label: "既定の表示", value: "読みやすい表示" },
    ],
  },
  {
    heading: "データ",
    rows: [
      { label: "オフライン保存の管理", value: "準備中" },
      { label: "エクスポート / インポート", value: "準備中" },
      { label: "ときどき六法と連携", value: "未接続" },
    ],
  },
];

const StaticSettingsGroup = ({ group }: { group: SettingsGroup }) => (
  <section className="grid gap-2">
    <h2 className="text-xs font-medium tracking-widest text-muted-foreground">{group.heading}</h2>
    <div className="divide-y rounded-md border bg-card">
      {group.rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-foreground">{row.label}</span>
          <span className="text-muted-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  </section>
);

export const SettingsPage = () => {
  const { baseDate, setBaseDate } = useBaseDate();
  const baseDateInputId = useId();
  const baseDateErrorId = useId();
  const [error, setError] = useState<string | undefined>();

  const handleBaseDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

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

      <StaticSettingsGroup group={staticGroups[0]} />

      <section className="grid gap-2">
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground">学習</h2>
        <div className="divide-y rounded-md border bg-card">
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
              value={baseDate ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              未設定のときは現行法（今日時点で施行）を表示します。
            </p>
            {error !== undefined ? (
              <p id={baseDateErrorId} role="alert" className="text-xs leading-5 text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-foreground">科目プリセット</span>
            <span className="text-muted-foreground">未設定</span>
          </div>
        </div>
      </section>

      <StaticSettingsGroup group={staticGroups[1]} />
    </section>
  );
};
