"use client";

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
        description={
          error.message ||
          "Апстрим Polymarket ответил ошибкой. Попробуйте обновить — обычно помогает."
        }
        action={
          <Button size="sm" onClick={reset}>
            Попробовать снова
          </Button>
        }
      />
      {error.digest && (
        <p className="mt-2 text-center text-[11px] text-faint">
          Код ошибки: {error.digest}
        </p>
      )}
    </Container>
  );
}
