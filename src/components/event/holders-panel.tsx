"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, queryKeys } from "@/lib/api";
import { formatCompact, shortenAddress, traderName } from "@/lib/format";
import type { HolderGroup, Market } from "@/lib/types";
import { outcomeColor } from "@/lib/utils";

function GroupSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 py-1">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  );
}

function HolderColumn({ group, market }: { group: HolderGroup; market: Market }) {
  const outcome = market.outcomes.find((o) => o.tokenId === group.tokenId);
  const label = outcome?.label ?? group.outcomeLabel;
  const color = outcomeColor(label, outcome?.index ?? 0);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold" style={{ color }}>
          {label}
        </span>
        <span className="tnum ml-auto text-[11px] text-faint">
          {group.holders.length} держателей
        </span>
      </div>

      {group.holders.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">Позиций нет</p>
      ) : (
        <ul className="space-y-0.5">
          {group.holders.map((holder, index) => (
            <li
              key={`${holder.proxyWallet}-${holder.asset}`}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-hover"
            >
              <span className="tnum w-4 shrink-0 text-right text-[11px] text-faint">
                {index + 1}
              </span>
              <Avatar
                src={holder.profileImage}
                name={holder.name || holder.pseudonym}
                seed={holder.proxyWallet}
                size={26}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text">
                  {traderName(holder)}
                </span>
                <span className="block truncate text-[10px] text-faint">
                  {shortenAddress(holder.proxyWallet)}
                </span>
              </span>
              <span className="tnum shrink-0 text-sm font-semibold text-text">
                {formatCompact(holder.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HoldersPanel({ market }: { market: Market }) {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.holders(market.conditionId),
    queryFn: ({ signal }) => api.holders(market.conditionId, market.id, signal),
    staleTime: 60_000,
    retry: 1,
  });

  if (isPending) {
    return (
      <div className="grid gap-6 py-1 sm:grid-cols-2">
        <GroupSkeleton />
        <GroupSkeleton />
      </div>
    );
  }

  const groups = (data ?? []).filter((g) => g.holders.length > 0);

  if (isError || !groups.length) {
    return (
      <EmptyState
        icon={<Users />}
        title="Держатели не найдены"
        description="По этому рынку ещё нет открытых позиций или данные недоступны."
      />
    );
  }

  return (
    <div className="grid gap-6 py-1 sm:grid-cols-2">
      {groups.slice(0, 2).map((group) => (
        <HolderColumn key={group.tokenId} group={group} market={market} />
      ))}
    </div>
  );
}
