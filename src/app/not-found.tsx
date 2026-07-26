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
        title="Такой страницы нет"
        description="Событие могло закрыться, а ссылка — устареть. Вернитесь к ленте рынков или найдите нужное через поиск в шапке."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/">На главную</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/markets">Все рынки</Link>
            </Button>
          </div>
        }
      />
    </Container>
  );
}
