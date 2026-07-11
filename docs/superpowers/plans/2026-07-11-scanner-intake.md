# スキャナー画面と画像入力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カメラ撮影・画像アップロード・画像プレビュー・権限エラー UI を備えた `/scanner` 画面を実装し、「画像を入力してプレビューできる」を満たす。

**Architecture:** 取り込みのドメイン（Blob/File・分類済みエラー・object URL ライフサイクル）を新規 `src/core/ocr` に置き、`getUserMedia` を `CameraStreamProvider` インターフェースで抽象化する。DOM/React 依存（ストリーム制御・canvas 描画・状態遷移）は `src/app`（`use-camera.ts` 隔離 + `scanner-page.tsx`）に閉じ込め、既定引数で本番実装を注入して fake provider でテスト可能にする。

**Tech Stack:** React 19 / TypeScript 6 / TanStack Router / Tailwind CSS 4 / lucide-react / Vitest + Testing Library + jsdom。

## Global Constraints

- `@/` alias は `src/` を指す。core は `@/core/...` から import する。
- アイコンは `lucide-react` を使う。
- コメントは日本語。非自明な直値・外部制約・回避策には理由コメントを付ける。
- テストは公開インターフェース越しの振る舞いを検証する。純粋関数は table testing に近い形で代表・境界ケースを並べる。
- 画像は端末内メモリ（Blob/object URL）にのみ保持し、保存・送信しない。送信しないことを UI に明記する。
- 各コミットの直前に検証ゲート `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test` を実行する。
- object URL は差し替え・破棄時に `URL.revokeObjectURL` で解放する。

---

### Task 1: `core/ocr` 取り込み型と File 取り込み

**Files:**

- Create: `src/core/ocr/types.ts`
- Create: `src/core/ocr/capture.ts`
- Create: `src/core/ocr/index.ts`
- Test: `src/core/ocr/capture.test.ts`

**Interfaces:**

- Consumes: なし。
- Produces:
  - `type CaptureSource = "camera" | "upload"`
  - `interface CapturedImage { blob: Blob; objectUrl: string; source: CaptureSource; fileName?: string }`
  - `type CameraErrorKind = "permission-denied" | "not-found" | "not-supported" | "unknown"`
  - `isImageFile(file: File): boolean`
  - `createCapturedImageFromFile(file: File): CapturedImage | undefined`
  - `releaseCapturedImage(image: CapturedImage): void`

- [ ] **Step 1: 型定義を書く**

`src/core/ocr/types.ts`:

```ts
// 取り込み元。プレビュー表示の区別や、後続 OCR の前処理分岐に使う。
export type CaptureSource = "camera" | "upload";

// 端末内メモリに保持する取り込み結果。保存・送信はしない。
export interface CapturedImage {
  // 撮影は canvas.toBlob、アップロードは File（Blob のサブタイプ）。
  blob: Blob;
  // <img src> 用。差し替え・破棄時に revokeObjectURL する。
  objectUrl: string;
  source: CaptureSource;
  // アップロード時のみ設定。撮影は未設定。
  fileName?: string;
}

// getUserMedia の失敗を UI 文言へ写像するための分類。
export type CameraErrorKind = "permission-denied" | "not-found" | "not-supported" | "unknown";
```

- [ ] **Step 2: 失敗するテストを書く**

`src/core/ocr/capture.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCapturedImageFromFile, isImageFile, releaseCapturedImage } from "./capture";

const imageFile = (name: string, type: string): File =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isImageFile", () => {
  it("accepts image mime types", () => {
    expect(isImageFile(imageFile("a.png", "image/png"))).toBe(true);
    expect(isImageFile(imageFile("a.jpg", "image/jpeg"))).toBe(true);
  });

  it("rejects non-image or empty mime types", () => {
    expect(isImageFile(imageFile("a.pdf", "application/pdf"))).toBe(false);
    expect(isImageFile(imageFile("a.bin", ""))).toBe(false);
  });
});

describe("createCapturedImageFromFile", () => {
  it("builds a CapturedImage from an image file", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const result = createCapturedImageFromFile(imageFile("shot.png", "image/png"));
    expect(result).toEqual({
      blob: expect.any(File),
      objectUrl: "blob:mock",
      source: "upload",
      fileName: "shot.png",
    });
  });

  it("returns undefined for a non-image file", () => {
    expect(createCapturedImageFromFile(imageFile("a.pdf", "application/pdf"))).toBeUndefined();
  });
});

describe("releaseCapturedImage", () => {
  it("revokes the object url", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    releaseCapturedImage({ blob: new Blob(), objectUrl: "blob:mock", source: "upload" });
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm test -- src/core/ocr/capture.test.ts`
Expected: FAIL（`capture.ts` が存在せず import 解決に失敗）。

- [ ] **Step 4: 実装を書く**

`src/core/ocr/capture.ts`:

```ts
import type { CapturedImage } from "./types";

export const isImageFile = (file: File): boolean => file.type.startsWith("image/");

// 画像ファイルを端末内メモリの CapturedImage へ変換する。画像でなければ undefined。
export const createCapturedImageFromFile = (file: File): CapturedImage | undefined => {
  if (!isImageFile(file)) {
    return undefined;
  }

  return {
    // File は Blob のサブタイプなので、そのまま blob として扱える。
    blob: file,
    objectUrl: URL.createObjectURL(file),
    source: "upload",
    fileName: file.name,
  };
};

// object URL を解放する。プレビュー差し替え・アンマウント時に呼び、リークを防ぐ。
export const releaseCapturedImage = (image: CapturedImage): void => {
  URL.revokeObjectURL(image.objectUrl);
};
```

`src/core/ocr/index.ts`:

```ts
export { createCapturedImageFromFile, isImageFile, releaseCapturedImage } from "./capture";
export type { CapturedImage, CaptureSource, CameraErrorKind } from "./types";
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test -- src/core/ocr/capture.test.ts`
Expected: PASS。

- [ ] **Step 6: 検証ゲートを実行してコミットする**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/core/ocr/types.ts src/core/ocr/capture.ts src/core/ocr/index.ts src/core/ocr/capture.test.ts
git commit -m "feat(core/ocr): 画像ファイルの取り込みと型を追加する"
```

---

### Task 2: `core/ocr` カメラプロバイダとエラー分類

**Files:**

- Create: `src/core/ocr/camera.ts`
- Modify: `src/core/ocr/index.ts`（camera のエクスポートを追加）
- Test: `src/core/ocr/camera.test.ts`

**Interfaces:**

- Consumes: `CameraErrorKind`（Task 1）。
- Produces:
  - `class CameraError extends Error { readonly kind: CameraErrorKind }`
  - `interface CameraStreamProvider { requestStream(): Promise<MediaStream> }`
  - `classifyCameraError(error: unknown): CameraErrorKind`
  - `isCameraSupported(): boolean`
  - `createCameraStreamProvider(): CameraStreamProvider`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/ocr/camera.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyCameraError } from "./camera";

const domException = (name: string): DOMException => new DOMException("x", name);

describe("classifyCameraError", () => {
  it("maps permission errors", () => {
    expect(classifyCameraError(domException("NotAllowedError"))).toBe("permission-denied");
    expect(classifyCameraError(domException("SecurityError"))).toBe("permission-denied");
  });

  it("maps device-not-found errors", () => {
    expect(classifyCameraError(domException("NotFoundError"))).toBe("not-found");
    expect(classifyCameraError(domException("OverconstrainedError"))).toBe("not-found");
  });

  it("maps unsupported errors", () => {
    expect(classifyCameraError(domException("NotSupportedError"))).toBe("not-supported");
  });

  it("falls back to unknown for other DOMExceptions and non-errors", () => {
    expect(classifyCameraError(domException("AbortError"))).toBe("unknown");
    expect(classifyCameraError("boom")).toBe("unknown");
    expect(classifyCameraError(undefined)).toBe("unknown");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/core/ocr/camera.test.ts`
Expected: FAIL（`camera.ts` が存在しない）。

- [ ] **Step 3: 実装を書く**

`src/core/ocr/camera.ts`:

```ts
import type { CameraErrorKind } from "./types";

// getUserMedia の失敗を kind 付きで表す。UI が文言を選ぶ際に参照する。
export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`camera error: ${kind}`, options);
    this.name = "CameraError";
  }
}

// カメラストリーム取得を抽象化する。既定実装は getUserMedia を包む。
// jsdom は mediaDevices を実装しないため、テストは fake を注入する。
export interface CameraStreamProvider {
  requestStream(): Promise<MediaStream>;
}

// DOMException.name を CameraErrorKind へ写像する純粋関数。
export const classifyCameraError = (error: unknown): CameraErrorKind => {
  if (error instanceof DOMException) {
    switch (error.name) {
      // ユーザーが許可しなかった / 非セキュアコンテキストで拒否。
      case "NotAllowedError":
      case "SecurityError":
        return "permission-denied";
      // デバイスが無い / 制約を満たすカメラが無い。
      case "NotFoundError":
      case "OverconstrainedError":
        return "not-found";
      case "NotSupportedError":
        return "not-supported";
      default:
        return "unknown";
    }
  }
  return "unknown";
};

// getUserMedia が利用可能か。SSR や非セキュアコンテキストでは false。
export const isCameraSupported = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

export const createCameraStreamProvider = (): CameraStreamProvider => ({
  async requestStream() {
    if (!isCameraSupported()) {
      throw new CameraError("not-supported");
    }
    try {
      // 学習資料の撮影は背面カメラが自然なため facingMode: environment を優先する。
      return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (cause) {
      throw new CameraError(classifyCameraError(cause), { cause });
    }
  },
});
```

`src/core/ocr/index.ts` に追記（Task 1 の内容を保ったまま以下を追加）:

```ts
export {
  CameraError,
  classifyCameraError,
  createCameraStreamProvider,
  isCameraSupported,
} from "./camera";
export type { CameraStreamProvider } from "./camera";
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/core/ocr/camera.test.ts`
Expected: PASS。

- [ ] **Step 5: 検証ゲートを実行してコミットする**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/core/ocr/camera.ts src/core/ocr/index.ts src/core/ocr/camera.test.ts
git commit -m "feat(core/ocr): カメラストリームプロバイダとエラー分類を追加する"
```

---

### Task 3: `/scanner` 画面（idle・アップロード・プレビュー・プライバシー明示）

暫定 `ScannerPage` を `pages.tsx` から分離し、アップロード経路とプレビューを実装する。この時点で完了条件「画像を入力してプレビューできる」を自動テストで満たす。カメラ生映像は Task 4。

**Files:**

- Create: `src/app/scanner-page.tsx`
- Modify: `src/app/pages.tsx`（暫定 `ScannerPage` を削除、`scanner-page` を re-export、未使用 import を整理）
- Test: `src/app/scanner-page.test.tsx`

**Interfaces:**

- Consumes: `createCapturedImageFromFile` / `releaseCapturedImage` / `CapturedImage`（Task 1）、`CameraStreamProvider` / `createCameraStreamProvider`（Task 2）。
- Produces:
  - `ScannerPage({ cameraStreamProvider?: CameraStreamProvider }): JSX.Element`
  - 再エクスポート `export { ScannerPage } from "./scanner-page"`（`pages.tsx`）

- [ ] **Step 1: 失敗するテストを書く**

`src/app/scanner-page.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScannerPage } from "./scanner-page";

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScannerPage アップロード", () => {
  it("shows the privacy note on the idle screen", () => {
    render(<ScannerPage />);
    expect(screen.getByText(/保存・送信されません/)).toBeInTheDocument();
  });

  it("previews a selected image file", () => {
    render(<ScannerPage />);

    const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    const preview = screen.getByRole("img", { name: /プレビュー/ });
    expect(preview).toHaveAttribute("src", "blob:mock");
  });

  it("returns to idle when retaking", () => {
    render(<ScannerPage />);

    const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "選び直す" }));

    expect(screen.queryByRole("img", { name: /プレビュー/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /画像を選ぶ/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/app/scanner-page.test.tsx`
Expected: FAIL（`scanner-page.tsx` が存在しない）。

- [ ] **Step 3: 画面を実装する（idle・アップロード・プレビュー）**

`src/app/scanner-page.tsx`（この時点ではカメラ生映像は未配線。「撮る」ボタンは Task 4 で有効化するため、まずアップロード導線を実装する）:

```tsx
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { ImageUp, RotateCcw } from "lucide-react";

import {
  createCameraStreamProvider,
  createCapturedImageFromFile,
  releaseCapturedImage,
} from "@/core/ocr";
import type { CameraStreamProvider, CapturedImage } from "@/core/ocr";
import { Button } from "@/shared/ui/button";

const defaultCameraStreamProvider = createCameraStreamProvider();

// 画像は端末内メモリでのみ保持し、保存・送信しないことを明示する注記。
const PrivacyNote = () => (
  <p className="text-xs text-muted-foreground">
    <span aria-hidden="true">🔒 </span>
    画像は端末内で処理され、保存・送信されません
  </p>
);

export const ScannerPage = ({
  cameraStreamProvider = defaultCameraStreamProvider,
}: {
  cameraStreamProvider?: CameraStreamProvider;
}) => {
  const [image, setImage] = useState<CapturedImage | undefined>();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // アンマウント時に未解放の object URL を確実に revoke する。
  const imageRef = useRef(image);
  imageRef.current = image;
  useEffect(
    () => () => {
      if (imageRef.current !== undefined) {
        releaseCapturedImage(imageRef.current);
      }
    },
    [],
  );

  // 新しい画像へ差し替える。直前の object URL は revoke してリークを防ぐ。
  const replaceImage = (next: CapturedImage | undefined) => {
    setImage((previous) => {
      if (previous !== undefined) {
        releaseCapturedImage(previous);
      }
      return next;
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを連続選択しても change が発火するよう値をリセットする。
    event.target.value = "";
    if (file === undefined) {
      return;
    }
    const captured = createCapturedImageFromFile(file);
    if (captured !== undefined) {
      replaceImage(captured);
    }
  };

  if (image !== undefined) {
    return (
      <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground">プレビュー</h1>
        <img
          alt="取り込んだ画像のプレビュー"
          className="w-full rounded-md border bg-card object-contain"
          src={image.objectUrl}
        />
        <p className="text-xs text-muted-foreground">条文の読み取りは準備中です。</p>
        <Button
          className="w-full"
          onClick={() => {
            replaceImage(undefined);
          }}
          type="button"
          variant="outline"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          選び直す
        </Button>
        <PrivacyNote />
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-12 text-center">
      <h1 className="font-serif text-2xl font-semibold text-foreground">
        問題集や資料から条文を開く
      </h1>
      <PrivacyNote />
      <label htmlFor={fileInputId} className="sr-only">
        画像を選ぶ
      </label>
      <input
        accept="image/*"
        className="sr-only"
        id={fileInputId}
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <Button
        className="h-auto w-full flex-col gap-1 py-8"
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        <ImageUp className="size-6" aria-hidden="true" />
        <span className="font-semibold">画像を選ぶ</span>
        <span className="text-xs opacity-75">ライブラリから画像を選択できます</span>
      </Button>
    </section>
  );
};
```

補足: `cameraStreamProvider` は Task 4 でカメラ配線に使うため、この段階では受け取るだけとする（未使用引数の lint を避けるため、Task 4 まで一時的に読み飛ばす必要があれば `void cameraStreamProvider;` を先頭に置いてもよい。ただし Task 3・4 を続けて実装する場合は不要）。

- [ ] **Step 4: `pages.tsx` を再エクスポートに置き換え、未使用 import を整理する**

`src/app/pages.tsx` の暫定 `ScannerPage` 定義（`export const ScannerPage = () => (...)`）を削除する。ファイル末尾の re-export 群に次を追加する:

```tsx
export { ScannerPage } from "./scanner-page";
```

先頭の import から、`ScannerPage` 削除により未使用となる `Button`（`@/shared/ui/button`）と lucide の `Camera` を除去する。`BookOpenCheck` は `LawsPage` が使うため残す。変更後の lucide import は次のとおり:

```tsx
import { BookOpenCheck } from "lucide-react";
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test -- src/app/scanner-page.test.tsx`
Expected: PASS（3 ケース）。

- [ ] **Step 6: 既存テストの回帰がないことを確認する**

Run: `pnpm test -- src/app/router.test.tsx src/app/AppShell.test.tsx`
Expected: PASS（`/scanner` ルートと「撮る」ナビは維持されている）。

- [ ] **Step 7: 検証ゲートを実行してコミットする**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/app/scanner-page.tsx src/app/pages.tsx src/app/scanner-page.test.tsx
git commit -m "feat(app): スキャナー画面に画像アップロードとプレビューを実装する"
```

---

### Task 4: カメラ生映像・撮影・権限エラー UI

`use-camera.ts` hook で getUserMedia のライフサイクルと canvas 撮影を扱い、`scanner-page.tsx` に「撮る」導線・ライブ映像・権限エラー UI・フォールバックを追加する。

**Files:**

- Create: `src/app/use-camera.ts`
- Modify: `src/app/scanner-page.tsx`（カメラ状態と UI を追加）
- Modify: `src/app/scanner-page.test.tsx`（カメラ系ケースを追加）

**Interfaces:**

- Consumes: `CameraError` / `CameraStreamProvider` / `CapturedImage`（Task 1・2）。
- Produces:
  - `type CameraStatus = "idle" | "active" | "error"`
  - `useCamera(provider: CameraStreamProvider): { status; error; attachVideo; start; capture; stop }`
    - `status: CameraStatus`
    - `error: CameraErrorKind | undefined`
    - `attachVideo: (node: HTMLVideoElement | null) => void`
    - `start: () => Promise<void>`
    - `capture: () => Promise<CapturedImage | undefined>`
    - `stop: () => void`

- [ ] **Step 1: hook を実装する**

`src/app/use-camera.ts`:

```ts
import { useCallback, useRef, useState } from "react";

import { CameraError } from "@/core/ocr";
import type { CameraErrorKind, CameraStreamProvider, CapturedImage } from "@/core/ocr";

export type CameraStatus = "idle" | "active" | "error";

export interface UseCameraResult {
  status: CameraStatus;
  error: CameraErrorKind | undefined;
  // <video> の ref コールバック。ストリーム取得と要素マウントの順序に依存しない。
  attachVideo: (node: HTMLVideoElement | null) => void;
  start: () => Promise<void>;
  capture: () => Promise<CapturedImage | undefined>;
  stop: () => void;
}

export const useCamera = (provider: CameraStreamProvider): UseCameraResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraErrorKind | undefined>();

  const stop = useCallback(() => {
    // 全トラックを停止しないとカメラの点灯が残る。
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current !== null) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
    setError(undefined);
  }, []);

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    // ストリーム取得後に <video> がマウントされた場合はここで接続する。
    if (node !== null && streamRef.current !== null) {
      node.srcObject = streamRef.current;
      // 自動再生が拒否されても致命的ではないため握りつぶす。
      node.play().catch(() => {});
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await provider.requestStream();
      streamRef.current = stream;
      const node = videoRef.current;
      if (node !== null) {
        node.srcObject = stream;
        node.play().catch(() => {});
      }
      setError(undefined);
      setStatus("active");
    } catch (cause) {
      setError(cause instanceof CameraError ? cause.kind : "unknown");
      setStatus("error");
    }
  }, [provider]);

  const capture = useCallback(async (): Promise<CapturedImage | undefined> => {
    const video = videoRef.current;
    if (video === null) {
      return undefined;
    }
    const canvas = document.createElement("canvas");
    // videoWidth/Height は再生前に 0 のことがあるため 720p を既定にする。
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (context === null) {
      return undefined;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      // JPEG 92% は画質と OCR 前提のサイズのバランス。
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92);
    });
    if (blob === null) {
      return undefined;
    }
    stop();
    return { blob, objectUrl: URL.createObjectURL(blob), source: "camera" };
  }, [stop]);

  return { status, error, attachVideo, start, capture, stop };
};
```

- [ ] **Step 2: 失敗するカメラ系テストを追加する**

`src/app/scanner-page.test.tsx` に、既存の import 群へ次を足す:

```tsx
import { CameraError } from "@/core/ocr";
import type { CameraStreamProvider } from "@/core/ocr";
```

`beforeEach` に、jsdom 非対応の DOM API をモックする行を追加する（既存の URL モックの下に）:

```tsx
// jsdom は canvas 2d と再生を実装しないため撮影経路をモックする。
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
  drawImage: vi.fn(),
} as unknown as CanvasRenderingContext2D);
vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
  callback(new Blob(["x"], { type: "image/jpeg" }));
});
vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
```

そして新しい describe ブロックを追加する:

```tsx
const fakeStream = (): MediaStream => ({ getTracks: () => [] }) as unknown as MediaStream;

const providerReturning = (stream: MediaStream): CameraStreamProvider => ({
  requestStream: () => Promise.resolve(stream),
});

const providerRejecting = (error: CameraError): CameraStreamProvider => ({
  requestStream: () => Promise.reject(error),
});

describe("ScannerPage カメラ", () => {
  it("shows a permission error and fallback when the stream is denied", async () => {
    render(
      <ScannerPage
        cameraStreamProvider={providerRejecting(new CameraError("permission-denied"))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/カメラ/);
    // フォールバックとして画像選択が残る。
    expect(screen.getByRole("button", { name: /画像を選ぶ/ })).toBeInTheDocument();
  });

  it("shows the live camera and returns to idle on cancel", async () => {
    render(<ScannerPage cameraStreamProvider={providerReturning(fakeStream())} />);

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));

    const cancel = await screen.findByRole("button", { name: "キャンセル" });
    fireEvent.click(cancel);

    expect(screen.getByRole("button", { name: /撮る/ })).toBeInTheDocument();
  });

  it("captures a frame into a preview", async () => {
    render(<ScannerPage cameraStreamProvider={providerReturning(fakeStream())} />);

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));
    const shutter = await screen.findByRole("button", { name: "シャッター" });
    fireEvent.click(shutter);

    const preview = await screen.findByRole("img", { name: /プレビュー/ });
    expect(preview).toHaveAttribute("src", "blob:mock");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm test -- src/app/scanner-page.test.tsx`
Expected: FAIL（「撮る」ボタンやカメラ UI が未実装）。

- [ ] **Step 4: `scanner-page.tsx` にカメラ UI を配線する**

`src/app/scanner-page.tsx` を次の内容へ更新する（Task 3 の構造を保ちつつカメラ状態を追加）:

```tsx
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { Camera, ImageUp, RotateCcw, X } from "lucide-react";

import {
  createCameraStreamProvider,
  createCapturedImageFromFile,
  releaseCapturedImage,
} from "@/core/ocr";
import type { CameraErrorKind, CameraStreamProvider, CapturedImage } from "@/core/ocr";
import { Button } from "@/shared/ui/button";

import { useCamera } from "./use-camera";

const defaultCameraStreamProvider = createCameraStreamProvider();

const PrivacyNote = () => (
  <p className="text-xs text-muted-foreground">
    <span aria-hidden="true">🔒 </span>
    画像は端末内で処理され、保存・送信されません
  </p>
);

// 権限エラーの種類ごとの説明文。fallback で必ず画像選択に逃がす。
const cameraErrorMessage = (kind: CameraErrorKind): string => {
  switch (kind) {
    case "permission-denied":
      return "カメラの使用が許可されていません。ブラウザの設定で許可するか、画像を選んでください。";
    case "not-found":
      return "使用できるカメラが見つかりません。画像を選んでください。";
    case "not-supported":
      return "この環境ではカメラを利用できません。画像を選んでください。";
    default:
      return "カメラを起動できませんでした。画像を選んでください。";
  }
};

export const ScannerPage = ({
  cameraStreamProvider = defaultCameraStreamProvider,
}: {
  cameraStreamProvider?: CameraStreamProvider;
}) => {
  const [image, setImage] = useState<CapturedImage | undefined>();
  const camera = useCamera(cameraStreamProvider);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const imageRef = useRef(image);
  imageRef.current = image;
  // アンマウント時に object URL の解放とカメラ停止を確実に行う。
  useEffect(
    () => () => {
      if (imageRef.current !== undefined) {
        releaseCapturedImage(imageRef.current);
      }
      camera.stop();
    },
    [camera],
  );

  const replaceImage = (next: CapturedImage | undefined) => {
    setImage((previous) => {
      if (previous !== undefined) {
        releaseCapturedImage(previous);
      }
      return next;
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) {
      return;
    }
    const captured = createCapturedImageFromFile(file);
    if (captured !== undefined) {
      replaceImage(captured);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleCapture = async () => {
    const captured = await camera.capture();
    if (captured !== undefined) {
      replaceImage(captured);
    }
  };

  // 共通の非表示ファイル入力。idle・error のどちらからも使う。
  const fileInput = (
    <input
      accept="image/*"
      className="sr-only"
      id={fileInputId}
      onChange={handleFileChange}
      ref={fileInputRef}
      type="file"
    />
  );

  if (image !== undefined) {
    return (
      <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground">プレビュー</h1>
        <img
          alt="取り込んだ画像のプレビュー"
          className="w-full rounded-md border bg-card object-contain"
          src={image.objectUrl}
        />
        <p className="text-xs text-muted-foreground">条文の読み取りは準備中です。</p>
        <Button
          className="w-full"
          onClick={() => {
            replaceImage(undefined);
          }}
          type="button"
          variant="outline"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {image.source === "camera" ? "撮り直す" : "選び直す"}
        </Button>
        <PrivacyNote />
      </section>
    );
  }

  if (camera.status === "active") {
    return (
      <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground">撮影</h1>
        <video
          aria-label="カメラプレビュー"
          className="w-full rounded-md border bg-black"
          muted
          playsInline
          ref={camera.attachVideo}
        />
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={camera.stop} type="button" variant="outline">
            <X className="size-4" aria-hidden="true" />
            キャンセル
          </Button>
          <Button
            onClick={() => {
              void handleCapture();
            }}
            type="button"
          >
            <Camera className="size-4" aria-hidden="true" />
            シャッター
          </Button>
        </div>
        <PrivacyNote />
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-12 text-center">
      <h1 className="font-serif text-2xl font-semibold text-foreground">
        問題集や資料から条文を開く
      </h1>
      <PrivacyNote />
      {camera.status === "error" && camera.error !== undefined ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 px-4 py-3 text-sm leading-6 text-destructive"
        >
          {cameraErrorMessage(camera.error)}
        </p>
      ) : null}
      <label htmlFor={fileInputId} className="sr-only">
        画像を選ぶ
      </label>
      {fileInput}
      <Button
        className="h-auto w-full flex-col gap-1 py-8"
        onClick={() => {
          void camera.start();
        }}
        type="button"
      >
        <Camera className="size-6" aria-hidden="true" />
        <span className="font-semibold">撮る</span>
        <span className="text-xs opacity-75">カメラで撮影します</span>
      </Button>
      <Button className="w-full" onClick={openFilePicker} type="button" variant="outline">
        <ImageUp className="size-4" aria-hidden="true" />
        画像を選ぶ
      </Button>
    </section>
  );
};
```

注記: Task 3 のテスト「previews a selected image file」は `getByLabelText("画像を選ぶ", { selector: "input" })` で非表示 input を引く。上記でも `<label htmlFor>` と input の関連付けを維持しているため引き続き通る。「選び直す」ボタン名はアップロード画像で `選び直す`、撮影画像で `撮り直す` になる点に注意（Task 3 のテストはアップロード経路なので `選び直す` のまま）。

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test -- src/app/scanner-page.test.tsx`
Expected: PASS（アップロード 3 + カメラ 3 = 6 ケース）。

- [ ] **Step 6: 検証ゲートを実行してコミットする**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/app/use-camera.ts src/app/scanner-page.tsx src/app/scanner-page.test.tsx
git commit -m "feat(app): スキャナー画面にカメラ撮影と権限エラー UI を実装する"
```

---

### Task 5: 実画面確認と PR

**Files:** なし（検証と PR のみ）。

- [ ] **Step 1: 全体の検証ゲートを実行する**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
```

Expected: すべて PASS。

- [ ] **Step 2: 実画面を playwright-cli で確認する**

`playwright-cli open --headed` で `/scanner` を開き、次を確認してスクリーンショットを撮る:

- idle 画面にプライバシー注記（🔒 保存・送信されません）が見える。
- 「画像を選ぶ」で画像を選択するとプレビューが表示される。
- デスクトップ幅・モバイル幅の両方でテキストがはみ出さない。

（カメラ許可ダイアログ・生映像は実機/実ブラウザ依存のため、可能な範囲で確認し、不可なら報告に明記する。）

- [ ] **Step 3: Antigravity review を実行する**

```bash
pnpm run review:antigravity
```

`agy` 非対応環境なら skip される。skip / 指摘 / クォータを最終報告に記録する。指摘は鵜呑みにせず妥当性を検証する。

- [ ] **Step 4: PR を作成する**

- `git push -u origin feat/issue-35-scanner-intake`
- 本文に `Close #35`、スクリーンショット（`github-image-upload` スキルで添付）、「動物界における比擬」セクションを含める。
- 作成後、`SlashNephy` を Assign する。

## Self-Review

- **Spec coverage**: §1 決定事項 → Task 1〜4 に対応。§2 スコープの ○ 項目（core/ocr / 画面 / カメラ / アップロード / プレビュー / 権限エラー / テスト）はすべてタスク化済み。× 項目（クリップボード・前処理・OCR エンジン）は未着手のまま（意図どおり）。§3 アーキテクチャの `core/ocr`（types/capture/camera）= Task 1・2、`use-camera`/`scanner-page` = Task 3・4。§7 プライバシー明示 = Task 3 Step 3 の `PrivacyNote` と Task 3 テスト。§8 テスト方針 = 各タスクの table/component テスト、Task 5 の playwright/antigravity。
- **Placeholder scan**: TBD/TODO・「適切なエラー処理」等の曖昧表現なし。全コードステップに実コードを記載。
- **Type consistency**: `CapturedImage` / `CaptureSource` / `CameraErrorKind`（Task 1）、`CameraError` / `CameraStreamProvider`（Task 2）、`useCamera` の戻り値（Task 4）を後続タスクの利用箇所と一致させた。`createCameraStreamProvider` / `createCapturedImageFromFile` / `releaseCapturedImage` の名前は index バレルと利用箇所で一致。
