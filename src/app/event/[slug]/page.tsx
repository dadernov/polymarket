import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EventView } from "@/components/event/event-view";
import { Container } from "@/components/layout/container";
import { formatVolume } from "@/lib/format";
import { fetchEventBySlug, fetchRelatedEvents } from "@/lib/polymarket";
import type { MarketEvent } from "@/lib/types";

export const revalidate = 15;

/** searchParams приходит как строка или массив — берём первое осмысленное. */
function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function summary(event: MarketEvent): string {
  const text = (event.description ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 190 ? `${text.slice(0, 187)}…` : text;
  return `Вероятности, стакан заявок и история сделок. Объём торгов ${formatVolume(event.volume)}.`;
}

/** Заглушку из utils в og:image класть нельзя — нужен абсолютный http-адрес. */
function ogImage(event: MarketEvent): string | undefined {
  const src = event.image ?? event.icon;
  return src && /^https?:\/\//.test(src) ? src : undefined;
}

export async function generateMetadata(
  props: PageProps<"/event/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const event = await fetchEventBySlug(slug).catch(() => null);

  if (!event) {
    return { title: "Событие не найдено", robots: { index: false, follow: false } };
  }

  const description = summary(event);
  const image = ogImage(event);

  return {
    title: event.title,
    description,
    alternates: { canonical: `/event/${event.slug}` },
    openGraph: {
      type: "website",
      title: event.title,
      description,
      url: `/event/${event.slug}`,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function Page(props: PageProps<"/event/[slug]">) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;

  const event = await fetchEventBySlug(slug);
  if (!event) notFound();

  // Похожие события — украшение страницы: их падение не должно ронять экран.
  const related = await fetchRelatedEvents(event, 8).catch(() => []);

  return (
    <Container className="py-6 lg:py-9">
      <EventView
        event={event}
        related={related}
        initialTokenId={firstParam(searchParams.outcome)}
        initialSide={firstParam(searchParams.side)}
      />
    </Container>
  );
}
