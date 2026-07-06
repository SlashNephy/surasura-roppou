import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Camera, GraduationCap, Search, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";

interface PaletteDestination {
  to: "/laws" | "/scanner" | "/study" | "/settings";
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
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

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
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const navigateTo = (to: PaletteDestination["to"]) => {
    setIsOpen(false);
    void navigate({ to });
  };

  return (
    <>
      <Button
        aria-label="検索"
        type="button"
        variant="outline"
        className="h-9 min-w-0 gap-2 px-3 font-normal text-muted-foreground md:w-full md:max-w-sm md:justify-start"
        onClick={() => {
          setIsOpen(true);
        }}
      >
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
        onOpenChange={setIsOpen}
        open={isOpen}
        title="検索"
      >
        <CommandInput placeholder="国賠法1条、民709、行政手続法14条…" />
        <CommandList>
          <CommandEmpty>条文参照ジャンプ（国賠1、民709 など）は今後対応予定です。</CommandEmpty>
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
        </CommandList>
      </CommandDialog>
    </>
  );
};
