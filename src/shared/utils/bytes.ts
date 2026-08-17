const bytesPerKilobyte = 1024;
const bytesPerMegabyte = bytesPerKilobyte * 1024;

/**
 * 保存容量の表示用。バイト単位は細かすぎ、GB に届く想定も無いため KB と MB だけを使う。
 * MB は小数第 1 位まで出す。法令 1 件が 0.4〜3 MB の範囲に収まり、整数だと差が潰れるため。
 * ただし丸めた結果が整数（例: 上限の 50 MB ちょうど）になったときは ".0" を出さない。
 * 「50.0 MB」は無意味な精度で、上限表示のような整数値と隣り合うと違いが目立って読みにくい。
 */
export const formatByteSize = (bytes: number): string => {
  if (bytes < bytesPerMegabyte) {
    return `${Math.round(bytes / bytesPerKilobyte).toLocaleString("ja-JP")} KB`;
  }

  const roundedMegabytes = Math.round((bytes / bytesPerMegabyte) * 10) / 10;
  const megabytesLabel = Number.isInteger(roundedMegabytes)
    ? roundedMegabytes.toFixed(0)
    : roundedMegabytes.toFixed(1);

  return `${megabytesLabel} MB`;
};
