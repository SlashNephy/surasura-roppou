import { useEffect, useDeferredValue, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Camera, GraduationCap, Search, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { QuickSearchCandidate, QuickSearchOutcome } from "@/core/jump";
import { Button } from "@/shared/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";

import type { PrimaryRoute } from "./routes";
import { navigateToCandidate } from "./search-navigation";
import { useSearchPalette } from "./search-palette-context";

interface PaletteDestination {
  to: PrimaryRoute;
  label: string;
  icon: LucideIcon;
}

const destinations: PaletteDestination[] = [
  { to: "/laws", label: "法令を探す", icon: BookOpen },
  { to: "/scanner", label: "撮って開く", icon: Camera },
  { to: "/study", label: "今日の復習", icon: GraduationCap },
  { to: "/settings", label: "設定", icon: Settings },
];

// 入力欄へのタイプ中に「/」でパレットが開かないよう、編集中の要素を除外する
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

export const SearchPalette = () => {
  const { isOpen, setOpen, quickSearch } = useSearchPalette();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [outcome, setOutcome] = useState<QuickSearchOutcome>({ status: "empty" });

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (trimmed === "") {
      // 空クエリのときは「移動」グループを表示するため outcome の更新は不要
      return;
    }

    let cancelled = false;
    void quickSearch
      .search(trimmed)
      .then((next) => {
        if (!cancelled) {
          setOutcome(next);
        }
      })
      .catch((error: unknown) => {
        console.error("quick search failed", error);
        if (!cancelled) {
          // 検索失敗時は空の候補リストにフォールバックして「該当なし」状態を表示する
          setOutcome({ status: "candidates", candidates: [], autoJump: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, quickSearch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing
      ) {
        return;
      }

      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setOpen]);

  const navigateTo = (to: PaletteDestination["to"]) => {
    setOpen(false);
    void navigate({ to });
  };

  // パレットを閉じるときは入力を空へ戻す。
  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (!open) {
      setQuery("");
    }
  };

  const goToCandidate = (candidate: QuickSearchCandidate) => {
    setOpen(false);
    setQuery("");
    navigateToCandidate(navigate, candidate);
  };

  const goToSearchPage = () => {
    const trimmed = query.trim();
    setOpen(false);
    setQuery("");
    void navigate({ to: "/search", search: { q: trimmed } });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-9 min-w-0 gap-2 px-3 font-normal text-muted-foreground md:w-full md:max-w-sm md:justify-start"
        onClick={() => {
          setOpen(true);
        }}
      >
        {/* 可視ラベル（例文）をアクセシブルネームに含めるため aria-label は使わない (WCAG 2.5.3) */}
        <span className="sr-only">検索</span>
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden truncate md:inline">国賠法1条、民709、行政手続法14条…</span>
        <kbd
          aria-hidden="true"
          className="ml-auto hidden rounded border px-1.5 text-[10px] md:inline"
        >
          /
        </kbd>
      </Button>
      <CommandDialog
        description="法令名や条文参照から目的の条文を開きます"
        onOpenChange={handleOpenChange}
        open={isOpen}
        title="検索"
        shouldFilter={false}
      >
        <CommandInput
          placeholder="国賠法1条、民709、行政手続法14条…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.trim() === "" ? (
            <CommandGroup heading="移動">
              {destinations.map((destination) => (
                <CommandItem
                  key={destination.to}
                  onSelect={() => {
                    navigateTo(destination.to);
                  }}
                >
                  <destination.icon aria-hidden="true" />
                  {destination.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <>
              {outcome.status === "candidates" && outcome.candidates.length > 0 ? (
                <CommandGroup heading="候補">
                  {outcome.candidates.map((candidate) => (
                    <CommandItem
                      key={`${candidate.kind}:${candidate.lawId}:${candidate.article ?? ""}`}
                      value={`${candidate.lawTitle} ${candidate.article ?? ""} ${candidate.lawId}`}
                      onSelect={() => {
                        goToCandidate(candidate);
                      }}
                    >
                      <span className="grid min-w-0">
                        <span className="truncate">
                          {candidate.lawTitle}
                          {candidate.article !== undefined ? ` 第${candidate.article}条` : ""}
                        </span>
                        {candidate.reason.length > 0 ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {candidate.reason.join(" / ")}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {outcome.status === "unresolved" ? (
                <CommandEmpty>
                  {outcome.reason === "needs-context"
                    ? "相対参照は前後の文脈が必要です。法令名を含めて入力してください。"
                    : "該当する法令が見つかりませんでした。"}
                </CommandEmpty>
              ) : null}
              {outcome.status === "candidates" && outcome.candidates.length === 0 ? (
                <CommandEmpty>該当する候補がありません。</CommandEmpty>
              ) : null}
              <CommandGroup>
                <CommandItem
                  value="__full_search__"
                  onSelect={() => {
                    goToSearchPage();
                  }}
                >
                  <Search aria-hidden="true" />「{query.trim()}」で検索
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
