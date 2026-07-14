import {
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import type { LawRepository } from "@/core/egov";
import type { QuickSearch } from "@/core/jump";
import { findSubject } from "@/core/study";
import type { SubjectId } from "@/core/study";
import type { StorageRepository } from "@/core/storage";

import { AppShell } from "./AppShell";
import {
  HomePage,
  LawsPage,
  LawViewerPage,
  ScannerPage,
  SearchPage,
  SettingsPage,
  StudyPage,
} from "./pages";
import { navigateToCandidate, navigateToReviewCandidate } from "./search-navigation";
import { SavedCollectionPage, SavedPage } from "./saved-page";
import { StudyCardDetailPage } from "./study-card-detail-page";
import { StudyCardsPage } from "./study-cards-page";
import { StudyReviewPage } from "./study-review-page";
import type { ReviewMode } from "./study-review-page";

interface CreateAppRouterOptions {
  history?: RouterHistory;
  lawRepository?: LawRepository;
  storageRepository?: StorageRepository;
  quickSearch?: QuickSearch;
}

const createRouteTree = ({
  lawRepository,
  storageRepository,
  quickSearch,
}: Pick<CreateAppRouterOptions, "lawRepository" | "storageRepository" | "quickSearch"> = {}) => {
  // AppShell に quickSearch を DI するため closure で包む。
  const RootComponent = () => <AppShell quickSearch={quickSearch} />;

  const rootRoute = createRootRoute({
    component: RootComponent,
  });

  const HomeRoute = () => <HomePage storageRepository={storageRepository} />;

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomeRoute,
  });

  const LawsRoute = () => <LawsPage storageRepository={storageRepository} />;

  const lawsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws",
    component: LawsRoute,
  });

  const LawViewerRoute = () => (
    <LawViewerPage repository={lawRepository} storageRepository={storageRepository} />
  );

  const lawViewerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId",
    component: LawViewerRoute,
  });

  const lawViewerArticleRoute = createRoute({
    getParentRoute: () => lawViewerRoute,
    path: "articles/$article",
    component: LawViewerRoute,
    // OCR 候補からの「復習に追加」は study=new を付けて遷移し、本文ロード後に
    // 学習カード作成ダイアログを自動起動する。未指定・他値は空 search に畳む。
    validateSearch: (search: Record<string, unknown>): { study?: "new" } =>
      search.study === "new" ? { study: "new" } : {},
  });

  const SavedRoute = () => <SavedPage storageRepository={storageRepository} />;

  const savedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "saved",
    component: SavedRoute,
  });

  const SavedCollectionRoute = () => <SavedCollectionPage storageRepository={storageRepository} />;

  const savedCollectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "saved/collections/$collectionId",
    component: SavedCollectionRoute,
  });

  // ScannerPage を route 非依存に保つため、遷移写像と repository を closure で注入する。
  const ScannerRoute = () => {
    const navigate = useNavigate();

    return (
      <ScannerPage
        storageRepository={storageRepository}
        onOpenCandidate={(candidate) => {
          navigateToCandidate(navigate, candidate);
        }}
        onAddToReview={(candidate) => {
          navigateToReviewCandidate(navigate, candidate);
        }}
      />
    );
  };

  const scannerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "scanner",
    component: ScannerRoute,
  });

  // StudyPage に storageRepository を DI するため closure で包む。
  const StudyRoute = () => <StudyPage storageRepository={storageRepository} />;

  const studyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "study",
    component: StudyRoute,
  });

  // StudyReviewPage に storageRepository を DI するため closure で包む。
  // mode が変わったら key で作り直し、進行中のセッション状態を初期化する。
  const StudyReviewRoute = () => {
    const { mode } = useSearch({ from: "/study/review" });

    return <StudyReviewPage key={mode} mode={mode} storageRepository={storageRepository} />;
  };

  const studyReviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "study/review",
    component: StudyReviewRoute,
    validateSearch: (search: Record<string, unknown>): { mode: ReviewMode } => ({
      // 不正な mode は "due" に丸める(スペック 10 章)。
      mode: search.mode === "new" ? "new" : "due",
    }),
  });

  // StudyCardsPage に storageRepository を DI するため closure で包む。
  const StudyCardsRoute = () => <StudyCardsPage storageRepository={storageRepository} />;

  const studyCardsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "study/cards",
    component: StudyCardsRoute,
    validateSearch: (search: Record<string, unknown>): { subject?: SubjectId } => ({
      // 科目別導線からの初期フィルタ。不明値は undefined（すべての科目）へフォールバックする。
      subject: typeof search.subject === "string" ? findSubject(search.subject)?.id : undefined,
    }),
  });

  // StudyCardDetailPage に storageRepository を DI するため closure で包む。
  const StudyCardDetailRoute = () => <StudyCardDetailPage storageRepository={storageRepository} />;

  const studyCardDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "study/cards/$cardId",
    component: StudyCardDetailRoute,
  });

  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "settings",
    component: SettingsPage,
  });

  // SearchPage に quickSearch を DI するため closure で包む。
  const SearchRoute = () => <SearchPage quickSearch={quickSearch} />;

  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "search",
    component: SearchRoute,
    validateSearch: (search: Record<string, unknown>) => ({
      q: typeof search.q === "string" ? search.q : "",
    }),
  });

  return rootRoute.addChildren([
    indexRoute,
    lawsRoute,
    lawViewerRoute.addChildren([lawViewerArticleRoute]),
    savedRoute,
    savedCollectionRoute,
    scannerRoute,
    studyRoute,
    studyReviewRoute,
    studyCardsRoute,
    studyCardDetailRoute,
    settingsRoute,
    searchRoute,
  ]);
};

export const createAppRouter = ({
  history,
  lawRepository,
  storageRepository,
  quickSearch,
}: CreateAppRouterOptions = {}) =>
  createRouter({
    routeTree: createRouteTree({ lawRepository, storageRepository, quickSearch }),
    history,
  });

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
