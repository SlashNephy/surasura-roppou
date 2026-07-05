import { Link, useParams } from "@tanstack/react-router";

import { LawDocumentView } from "@/core/viewer";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import type { LawViewerDocument } from "./law-viewer-sample";

export type LawViewerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "offline-unavailable"; lawTitle: string }
  | ({ status: "ready" } & LawViewerDocument);

const getLawViewerDocument = (lawId: string): LawViewerState => {
  if (lawId === "offline-demo") {
    return { status: "offline-unavailable", lawTitle: "民法" };
  }

  if (lawId !== "129AC0000000089") {
    return { status: "error", message: "法令が見つかりません。" };
  }

  return { status: "ready", ...sampleLawViewerDocument };
};

export const LawViewerPage = () => {
  const { lawId } = useParams({ from: "/laws/$lawId" });

  return <LawViewerPageContent state={getLawViewerDocument(lawId)} />;
};

export const LawViewerPageContent = ({ state }: { state: LawViewerState }) => {
  switch (state.status) {
    case "loading":
      return <LawViewerLoadingState />;

    case "error":
      return <LawViewerErrorState message={state.message} />;

    case "offline-unavailable":
      return <LawViewerOfflineState lawTitle={state.lawTitle} />;

    case "ready":
      return (
        <section className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 md:px-6 md:py-8">
          <LawDocumentView
            isSaved={state.isSaved}
            law={state.law}
            nodes={state.nodes}
            revision={state.revision}
          />
        </section>
      );
  }
};

const LawViewerLoadingState = () => (
  <section
    aria-label="法令本文を読み込み中"
    className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 md:px-6 md:py-8"
  >
    <div className="grid gap-3 border-b pb-5">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-9 w-full max-w-80" />
      <Skeleton className="h-5 w-full max-w-56" />
    </div>
    <div className="grid gap-4">
      <Skeleton className="h-8 w-full max-w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  </section>
);

const LawViewerErrorState = ({ message }: { message: string }) => (
  <section
    role="alert"
    className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10 md:px-6"
  >
    <div className="grid gap-2">
      <h1 className="text-2xl font-semibold text-foreground">法令を表示できません</h1>
      <p className="text-base leading-7 text-muted-foreground">{message}</p>
    </div>
    <Button asChild className="w-fit">
      <Link to="/laws">法令検索へ戻る</Link>
    </Button>
  </section>
);

const LawViewerOfflineState = ({ lawTitle }: { lawTitle: string }) => (
  <section
    role="status"
    className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10 md:px-6"
  >
    <div className="grid gap-2">
      <p className="text-sm font-medium text-primary">{lawTitle}</p>
      <h1 className="text-2xl font-semibold text-foreground">この法令は端末に保存されていません</h1>
      <p className="text-base leading-7 text-muted-foreground">
        オフラインで表示するには、通信できる状態で法令本文を開いて保存してください。
      </p>
    </div>
    <Button asChild variant="outline" className="w-fit">
      <Link to="/laws">法令検索へ戻る</Link>
    </Button>
  </section>
);
