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
    <Container className="py-6 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text">Лидеры</h1>
        <p className="mt-1 text-sm text-muted">
          Кто больше всех торгует и зарабатывает на прогнозах. Данные Polymarket.
        </p>
      </header>

      <LeaderboardTable />
    </Container>
  );
}
