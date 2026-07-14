import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
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
import { SavedCollectionPage, SavedPage } from "./saved-page";
import { StudyCardDetailPage } from "./study-card-detail-page";
import { StudyCardsPage } from "./study-cards-page";

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

  const scannerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "scanner",
    component: ScannerPage,
  });

  // StudyPage に storageRepository を DI するため closure で包む。
  const StudyRoute = () => <StudyPage storageRepository={storageRepository} />;

  const studyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "study",
    component: StudyRoute,
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
