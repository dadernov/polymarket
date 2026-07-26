"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { isNavActive, NAV_ITEMS } from "./sidebar";
import { SearchDialog } from "./search-dialog";

const ITEM =
  "flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors";

export function MobileNav() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/95 backdrop-blur-xl lg:hidden",
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <div className="flex items-stretch">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={cn(ITEM, "text-muted hover:text-text")}
            aria-label="Поиск"
          >
            <span className="grid size-6 place-items-center rounded-lg bg-accent-soft text-accent">
              <Search className="size-4" />
            </span>
            Поиск
          </button>

          {NAV_ITEMS.slice(2).map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function MobileLink({
  item,
  pathname,
}: {
  item: (typeof NAV_ITEMS)[number];
  pathname: string;
}) {
  const active = isNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(ITEM, active ? "text-text" : "text-faint hover:text-muted")}
    >
      <item.icon className={cn("size-5", active && "text-accent")} />
      {item.label}
    </Link>
  );
}
