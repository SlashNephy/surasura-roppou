import { afterEach, beforeEach, vi } from "vitest";

type ScrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => void;

export const setupScrollMocks = () => {
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(window, "scrollTo");
  const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollIntoView",
  );
  let scrollIntoView = vi.fn<ScrollIntoView>();

  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    scrollIntoView = vi.fn<ScrollIntoView>();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });
  });

  afterEach(() => {
    if (scrollToDescriptor === undefined) {
      Reflect.deleteProperty(window, "scrollTo");
    } else {
      Object.defineProperty(window, "scrollTo", scrollToDescriptor);
    }

    if (scrollIntoViewDescriptor === undefined) {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    } else {
      Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoViewDescriptor);
    }
  });

  return {
    get scrollIntoView() {
      return scrollIntoView;
    },
  };
};
