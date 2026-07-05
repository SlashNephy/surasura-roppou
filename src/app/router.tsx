import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import type { LawRepository } from "@/core/egov";

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

interface CreateAppRouterOptions {
  history?: RouterHistory;
  lawRepository?: LawRepository;
}

const createRouteTree = ({ lawRepository }: Pick<CreateAppRouterOptions, "lawRepository"> = {}) => {
  const rootRoute = createRootRoute({
    component: AppShell,
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomePage,
  });

  const lawsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws",
    component: LawsPage,
  });

  const LawViewerRoute = () => <LawViewerPage repository={lawRepository} />;

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
    jumpRoute,
    scannerRoute,
    studyRoute,
    settingsRoute,
  ]);
};

export const createAppRouter = ({ history, lawRepository }: CreateAppRouterOptions = {}) =>
  createRouter({ routeTree: createRouteTree({ lawRepository }), history });

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
