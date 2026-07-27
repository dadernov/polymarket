"use client";

// Директива нужна из-за <Button asChild>: Slot зовёт Children.only, а из
// серверного компонента дети приходят RSC-потоком как массив — см. комментарий
// в src/app/not-found.tsx.

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

/**
 * Отдельный экран для несуществующего события: страница события вызывает
 * notFound() и по общему 404 было бы непонятно, пропало событие или адрес.
 */
export default function EventNotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-xl">
        <p className="text-[10.5px] font-semibold uppercase leading-none tracking-[0.18em] text-faint">
          Событие
        </p>

        <h1 className="display mt-4 text-[32px] leading-[1.05] text-text sm:text-[42px]">
          Этого события больше нет
        </h1>

        <div className="rule mt-6 pb-6">
          <p className="text-sm leading-relaxed text-muted">
            Polymarket не отдаёт рынок по такому адресу. Обычно это значит одно
            из двух: событие рассчитано и убрано из выдачи или ссылка ведёт на
            старый вариант адреса.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Похожие рынки почти всегда есть — найдите их поиском по каталогу,
            а рассчитанные смотрите в архиве.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href="/markets">
              Искать в каталоге
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/markets?closed=true">Архив завершённых</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
