import type { SavedDataFile } from "@/core/native-integration";

export const downloadTextFile = ({ contents, fileName, mediaType }: SavedDataFile): void => {
  const blob = new Blob([contents], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
  const link = document.createElement("a");

  try {
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // click 後すぐ解放するとブラウザが Blob を読む前に URL が無効になるため、短時間だけ保持する。
    window.setTimeout(() => {
      revokeObjectUrl(url);
    }, 100);
  }
};
