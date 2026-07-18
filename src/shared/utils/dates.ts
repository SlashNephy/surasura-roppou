// 先頭が YYYY-MM-DD の日付（日時付き ISO 文字列も可）だけを受け付ける。
// 桁数だけの緩い判定だと "not-a-date" が "not/a/date" として表示されてしまうため。
const isoDatePrefixPattern = /^\d{4}-\d{2}-\d{2}/;

// ISO 8601 文字列から日付部分を取り出し yyyy/mm/dd で表示する。壊れた値は「不明」とする。
export const formatIsoDateLabel = (value: string | undefined): string =>
  typeof value === "string" && isoDatePrefixPattern.test(value)
    ? value.slice(0, 10).replace(/-/g, "/")
    : "不明";
