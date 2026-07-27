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
    <Container className="py-7 lg:py-9">
      <header className="rule pb-5">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-faint">
          Живая лента
        </p>
        <h1 className="display mt-2.5 text-[34px] leading-[1.04] text-text sm:text-[42px]">
          Активность
        </h1>
        <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          Кто, что и по какой цене покупает прямо сейчас — по всем рынкам сразу.
          Лента сама обновляется каждые несколько секунд.
        </p>
      </header>

      <div className="mt-6">
        <GlobalActivity />
      </div>
    </Container>
  );
}
