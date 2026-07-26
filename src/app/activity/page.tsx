import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { GlobalActivity } from "@/components/activity/global-activity";

export const metadata: Metadata = {
  title: "Активность",
  description:
    "Живая лента сделок Polymarket: кто, что и по какой цене покупает прямо сейчас.",
};

export default function ActivityPage() {
  return (
    <Container className="py-6 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text">Активность</h1>
        <p className="mt-1 text-sm text-muted">
          Живая лента сделок по всем рынкам — обновляется каждые несколько секунд.
        </p>
      </header>

      <GlobalActivity />
    </Container>
  );
}
