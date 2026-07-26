import Link from "next/link";
import { Compass } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <Container className="py-20">
      <EmptyState
        icon={<Compass />}
        title="Страница не найдена"
        description="Возможно, событие закрылось или ссылка устарела. Попробуйте вернуться к списку рынков."
        action={
          <Button asChild size="sm">
            <Link href="/">К рынкам</Link>
          </Button>
        }
      />
    </Container>
  );
}
