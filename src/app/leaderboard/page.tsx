import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";

export const metadata: Metadata = {
  title: "Лидеры",
  description:
    "Рейтинг трейдеров Polymarket по обороту и прибыли за день, неделю, месяц и всё время.",
};

export default function LeaderboardPage() {
  return (
    <Container className="py-7 lg:py-9">
      <header className="rule pb-5">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-faint">
          Рейтинг трейдеров
        </p>
        <h1 className="display mt-2.5 text-[34px] leading-[1.04] text-text sm:text-[42px]">
          Лидеры
        </h1>
        <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          Кто больше всех торгует и точнее всех угадывает исходы. Оборот и
          чистый результат по публичным данным Polymarket.
        </p>
      </header>

      <div className="mt-6">
        <LeaderboardTable />
      </div>
    </Container>
  );
}
