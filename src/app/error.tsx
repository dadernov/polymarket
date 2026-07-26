"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
    <Container className="py-20">
      <EmptyState
        icon={<CircleAlert />}
        title="Не удалось загрузить данные"
        description="Публичный API Polymarket не ответил вовремя. Данные на месте — обычно достаточно повторить попытку через пару секунд."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={reset}>
              Попробовать снова
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/">На главную</Link>
            </Button>
          </div>
        }
      />

      {/* Техническая строка нужна для поддержки, поэтому держим её отдельно от текста для человека. */}
      {(error.message || error.digest) && (
        <p className="mt-2 text-center text-[11px] leading-relaxed text-faint">
          {error.message}
          {error.message && error.digest ? " · " : ""}
          {error.digest && <span className="tnum">код {error.digest}</span>}
        </p>
      )}
    </Container>
  );
}
