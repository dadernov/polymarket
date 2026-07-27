"use client";

import { ArrowRight, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

/**
 * Экран сбоя. Формулировки конкретные: человеку важно знать, что именно
 * не удалось (данные рынков не пришли), что с его деньгами (демо-счёт лежит
 * в браузере и не пострадал) и что делать дальше.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-xl">
        <p className="text-[10.5px] font-semibold uppercase leading-none tracking-[0.18em] text-no">
          Сбой загрузки
        </p>

        <h1 className="display mt-4 text-[32px] leading-[1.05] text-text sm:text-[42px]">
          Данные рынков не загрузились
        </h1>

        <div className="rule mt-6 pb-6">
          <p className="text-sm leading-relaxed text-muted">
            Котировки приходят из публичного API Polymarket, и на этот раз он не
            ответил вовремя. Сами рынки на месте — чаще всего достаточно
            повторить попытку через пару секунд.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Баланс и позиции демо-счёта хранятся у вас в браузере: с ними ничего
            не случилось.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button onClick={reset}>
            <RotateCw className="size-4" aria-hidden />
            Повторить загрузку
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              Вернуться к рынкам
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        {/* Техническая строка нужна поддержке — держим её отдельно от текста для человека. */}
        {(error.message || error.digest) && (
          <details className="mt-10">
            <summary className="w-fit cursor-pointer text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint transition-colors hover:text-muted">
              Техническая информация
            </summary>
            <p className="mt-2.5 break-words text-[11.5px] leading-relaxed text-faint">
              {error.message}
              {error.message && error.digest ? " · " : ""}
              {error.digest && <span className="tnum">код {error.digest}</span>}
            </p>
          </details>
        )}
      </div>
    </Container>
  );
}
