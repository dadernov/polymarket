"use client";

// Директива здесь не про интерактивность: <Button asChild> внутри Slot зовёт
// Children.only, а из серверного компонента дети приезжают RSC-потоком как
// массив — Slot на этом падает, и вместо 404 показывается экран ошибки.

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-xl">
        {/* Код ошибки — крупный «объект» страницы в духе остальной типографики. */}
        <p className="display tnum text-[64px] leading-none text-faint/60 sm:text-[80px]">
          404
        </p>

        <h1 className="display mt-4 text-[32px] leading-[1.05] text-text sm:text-[42px]">
          Такой страницы у нас нет
        </h1>

        <div className="rule mt-6 pb-6">
          <p className="text-sm leading-relaxed text-muted">
            Возможно, адрес набран с опечаткой или ссылка успела устареть:
            события закрываются, и их страницы уходят в архив.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Начните с каталога — там поиск по названию, сортировка и фильтр
            завершённых рынков.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href="/markets">
              В каталог рынков
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">На главную</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
