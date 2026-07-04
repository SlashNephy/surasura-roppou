import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import { HomePage, JumpPage, LawsPage, ScannerPage, SettingsPage, StudyPage } from "./pages";

const rootRoute = createRootRoute({
  component: Outlet,
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  lawsRoute,
  jumpRoute,
  scannerRoute,
  studyRoute,
  settingsRoute,
]);

interface CreateAppRouterOptions {
  history?: RouterHistory;
}

export const createAppRouter = ({ history }: CreateAppRouterOptions = {}) =>
  createRouter({ routeTree, history });

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
