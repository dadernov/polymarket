"use client";

/**
 * Нижняя половина страницы события: сделки, держатели, правила, обсуждение.
 * Состав вкладок прежний — переодета только подача: заголовок раздела
 * антиквой, служебная подпись капителью, содержимое живёт без рамки, чтобы
 * не соперничать с карточками выше.
 */

import { useState } from "react";

import { ActivityFeed } from "@/components/event/activity-feed";
import { Comments } from "@/components/event/comments";
import { HoldersPanel } from "@/components/event/holders-panel";
import { MarketRules } from "@/components/event/market-rules";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { Market, MarketEvent } from "@/lib/types";

type TabValue = "activity" | "holders" | "rules" | "comments";

/** Подпись под вкладками: к чему относится содержимое выбранной. */
const HINTS: Record<TabValue, string> = {
  activity: "Сделки участников по рынкам события, самые свежие сверху",
  holders: "Крупнейшие позиции по выбранному рынку",
  rules: "По этому тексту и подводится итог",
  comments: "Обсуждение хранится в этом браузере и никуда не отправляется",
};

export function EventTabs({
  event,
  market,
}: {
  event: MarketEvent;
  /** Выбранный в списке исходов рынок: держатели и правила показываются по нему. */
  market: Market;
}) {
  const [tab, setTab] = useState<TabValue>("activity");

  // Счётчик у обсуждения — с Polymarket: локальная лента своё число показывает сама.
  const tabs: TabItem<TabValue>[] = [
    { value: "activity", label: "Активность" },
    { value: "holders", label: "Держатели" },
    { value: "rules", label: "Правила" },
    { value: "comments", label: "Обсуждение", count: event.commentCount },
  ];

  return (
    <section>
      <h2 className="display text-[20px] leading-tight text-text">
        Что происходит на рынке
      </h2>

      <div className="mt-3">
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </div>

      <p className="mt-3 text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
        {HINTS[tab]}
      </p>

      <div role="tabpanel" className="animate-fade-in pt-4">
        {tab === "activity" && <ActivityFeed event={event} />}
        {tab === "holders" && <HoldersPanel key={market.id} market={market} />}
        {tab === "rules" && <MarketRules key={market.id} event={event} market={market} />}
        {tab === "comments" && <Comments event={event} />}
      </div>
    </section>
  );
}
