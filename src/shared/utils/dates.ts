// ISO 8601 文字列から日付部分を取り出し yyyy/mm/dd で表示する。壊れた値は「不明」とする。
export const formatIsoDateLabel = (value: string | undefined): string =>
  typeof value === "string" && value.length >= 10 ? value.slice(0, 10).replace(/-/g, "/") : "不明";
