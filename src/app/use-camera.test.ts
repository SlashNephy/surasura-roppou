import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CameraStreamProvider } from "@/core/ocr";

import { useCamera } from "./use-camera";

// track.stop の呼び出し = カメラ点灯が消えたことの観測点。
const fakeStream = () => {
  const track = { stop: vi.fn() };
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    track,
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCamera ストリームのライフサイクル", () => {
  it("追い越された start のストリームを停止して破棄する", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const pending = [deferred<MediaStream>(), deferred<MediaStream>()];
    let call = 0;
    const provider: CameraStreamProvider = {
      requestStream: () => pending[call++].promise,
    };
    const { result } = renderHook(() => useCamera(provider));

    // 2 回連続で start（2 回目が最新）。
    await act(() => {
      void result.current.start();
      void result.current.start();
      return Promise.resolve();
    });
    await act(async () => {
      pending[0].resolve(first.stream); // 追い越された（世代が古い）
      pending[1].resolve(second.stream); // 最新
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });
    // 古い世代のストリームは破棄のため停止される。最新は生かす。
    expect(first.track.stop).toHaveBeenCalled();
    expect(second.track.stop).not.toHaveBeenCalled();
  });

  it("アンマウント中に解決した start のストリームを停止する", async () => {
    const late = fakeStream();
    const pending = deferred<MediaStream>();
    const provider: CameraStreamProvider = {
      requestStream: () => pending.promise,
    };
    const { result, unmount } = renderHook(() => useCamera(provider));

    await act(() => {
      void result.current.start();
      return Promise.resolve();
    });
    unmount();
    await act(async () => {
      pending.resolve(late.stream);
      await Promise.resolve();
    });

    // アンマウント後に届いたストリームは即座に停止する。
    expect(late.track.stop).toHaveBeenCalled();
  });

  it("多重起動で前のストリームを停止してから差し替える", async () => {
    const first = fakeStream();
    const second = fakeStream();
    const streams = [first.stream, second.stream];
    let call = 0;
    const provider: CameraStreamProvider = {
      requestStream: () => Promise.resolve(streams[call++]),
    };
    const { result } = renderHook(() => useCamera(provider));

    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });
    await act(async () => {
      await result.current.start();
    });

    // 2 回目の起動で 1 回目のストリームを停止する（点灯の残留を防ぐ）。
    expect(first.track.stop).toHaveBeenCalled();
  });
});
