import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import type { LawRepository } from "@/core/egov";
import type { StorageRepository } from "@/core/storage";

import { AppShell } from "./AppShell";
import {
  HomePage,
  JumpPage,
  LawsPage,
  LawViewerPage,
  ScannerPage,
  SettingsPage,
  StudyPage,
} from "./pages";
import { SavedCollectionPage, SavedPage } from "./saved-page";

interface CreateAppRouterOptions {
  history?: RouterHistory;
  lawRepository?: LawRepository;
  storageRepository?: StorageRepository;
}

const createRouteTree = ({
  lawRepository,
  storageRepository,
}: Pick<CreateAppRouterOptions, "lawRepository" | "storageRepository"> = {}) => {
  const rootRoute = createRootRoute({
    component: AppShell,
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomePage,
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

  const jumpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "jump",
    component: JumpPage,
  });

  const scannerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "scanner",
    component: ScannerPage,
  });

  const studyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "study",
    component: StudyPage,
  });

  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "settings",
    component: SettingsPage,
  });

  return rootRoute.addChildren([
    indexRoute,
    lawsRoute,
    lawViewerRoute.addChildren([lawViewerArticleRoute]),
    savedRoute,
    savedCollectionRoute,
    jumpRoute,
    scannerRoute,
    studyRoute,
    settingsRoute,
  ]);
};

export const createAppRouter = ({
  history,
  lawRepository,
  storageRepository,
}: CreateAppRouterOptions = {}) =>
  createRouter({ routeTree: createRouteTree({ lawRepository, storageRepository }), history });

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
