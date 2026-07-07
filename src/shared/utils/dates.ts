// ISO 8601 文字列から日付部分（YYYY-MM-DD）を取り出す。壊れた値は「不明」として表示する
export const formatIsoDateLabel = (value: string | undefined): string =>
  typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : "不明";
