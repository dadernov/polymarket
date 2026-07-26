"use client";

import { useState } from "react";

import { ActivityFeed } from "@/components/event/activity-feed";
import { HoldersPanel } from "@/components/event/holders-panel";
import { MarketRules } from "@/components/event/market-rules";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { Market, MarketEvent } from "@/lib/types";

type TabValue = "activity" | "holders" | "rules";

const TABS: TabItem<TabValue>[] = [
  { value: "activity", label: "Активность" },
  { value: "holders", label: "Держатели" },
  { value: "rules", label: "Правила" },
];

export function EventTabs({
  event,
  market,
}: {
  event: MarketEvent;
  /** Выбранный в списке исходов рынок: держатели и правила показываются по нему. */
  market: Market;
}) {
  const [tab, setTab] = useState<TabValue>("activity");

  return (
    <section>
      <Tabs items={TABS} value={tab} onChange={setTab} />

      <div className="animate-fade-in pt-3">
        {tab === "activity" && <ActivityFeed event={event} />}
        {tab === "holders" && <HoldersPanel key={market.id} market={market} />}
        {tab === "rules" && <MarketRules key={market.id} event={event} market={market} />}
      </div>
    </section>
  );
}
