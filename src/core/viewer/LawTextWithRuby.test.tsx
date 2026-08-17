import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LawTextWithRuby } from "./LawTextWithRuby";

const renderText = (element: React.ReactElement) => {
  const { container } = render(element);

  return {
    container,
    rubies: [...container.querySelectorAll("ruby")].map((ruby) => ({
      base: ruby.firstChild?.textContent,
      ruby: ruby.querySelector("rt")?.textContent,
    })),
  };
};

describe("LawTextWithRuby", () => {
  it("wraps every occurrence of the annotated word", () => {
    const { container, rubies } = renderText(
      <LawTextWithRuby
        annotations={[{ base: "傭", text: "よう" }]}
        text="定期傭船契約は、傭船料を支払う。"
      />,
    );

    expect(rubies).toEqual([
      { base: "傭", ruby: "よう" },
      { base: "傭", ruby: "よう" },
    ]);
    expect(container.textContent).toBe("定期傭よう船契約は、傭よう船料を支払う。");
  });

  it("prefers the longest annotation when one base contains another", () => {
    const { rubies } = renderText(
      <LawTextWithRuby
        annotations={[
          { base: "傭", text: "よう" },
          { base: "傭船", text: "ようせん" },
        ]}
        text="傭船"
      />,
    );

    expect(rubies).toEqual([{ base: "傭船", ruby: "ようせん" }]);
  });

  it("renders plain text when the same word has conflicting readings", () => {
    const { container, rubies } = renderText(
      <LawTextWithRuby
        annotations={[
          { base: "表", text: "ひょう" },
          { base: "表", text: "おもて" },
        ]}
        text="別表を見る。"
      />,
    );

    expect(rubies).toEqual([]);
    expect(container.textContent).toBe("別表を見る。");
  });

  it("matches annotations against readable-mode transformed text", () => {
    // readable では本文が「(…)」→「（…）」に変換されるため、注記側も同じ変換を通す。
    const { rubies } = renderText(
      <LawTextWithRuby
        annotations={[{ base: "(瑕疵)", text: "かし" }]}
        displayMode="readable"
        text="（瑕疵）によって"
      />,
    );

    expect(rubies).toEqual([{ base: "（瑕疵）", ruby: "かし" }]);
  });

  it("keeps the text intact for empty or missing annotations", () => {
    const { container: withoutAnnotations } = renderText(<LawTextWithRuby text="本文。" />);
    const { container: withEmptyBase } = renderText(
      <LawTextWithRuby annotations={[{ base: "", text: "かし" }]} text="本文。" />,
    );

    expect(withoutAnnotations.textContent).toBe("本文。");
    expect(withEmptyBase.textContent).toBe("本文。");
    expect(withEmptyBase.querySelector("ruby")).toBeNull();
  });

  it("escapes regular expression metacharacters in the base", () => {
    const { rubies } = renderText(
      <LawTextWithRuby annotations={[{ base: "a(b)", text: "えー" }]} text="x a(b) y" />,
    );

    expect(rubies).toEqual([{ base: "a(b)", ruby: "えー" }]);
  });
});
