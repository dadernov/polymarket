"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/** Ширина растушёвки у края ленты. */
const FADE = 28;

/**
 * Растушёвка только с той стороны, где список реально продолжается.
 * Постоянная маска подъедает крайний элемент даже у непрокрученной ленты —
 * первый чип выглядит обрезанным на пустом месте.
 */
function edgeMask(left: boolean, right: boolean): string | undefined {
  if (!left && !right) return undefined;
  const start = left ? `transparent 0, #000 ${FADE}px` : "#000 0";
  const end = right ? `#000 calc(100% - ${FADE}px), transparent 100%` : "#000 100%";
  return `linear-gradient(to right, ${start}, ${end})`;
}

export interface EdgeFade<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  /** Есть ли скрытое содержимое слева/справа. */
  edges: { left: boolean; right: boolean };
  /** Навесить на саму ленту вместе с `ref` и `onScroll`. */
  style: CSSProperties;
  onScroll: () => void;
  /** Прокрутить на ~экран в сторону: 1 — вправо, -1 — влево. */
  nudge: (direction: 1 | -1) => void;
}

/**
 * Горизонтальная лента: подсказки о краях и прокрутка колесом мыши.
 *
 * Колесо по умолчанию крутит страницу вертикально, и над горизонтальной лентой
 * это читается как «она не скроллится» — самая частая претензия к таким лентам.
 */
export function useEdgeFade<T extends HTMLElement>(): EdgeFade<T> {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onScroll();
    // Содержимое лент приезжает асинхронно (теги, ряды цен), поэтому одного
    // замера при монтировании мало — следим за изменением размеров.
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [onScroll]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaX !== 0) return; // трекпад уже даёт горизонталь
      const delta = event.deltaY;
      if (!delta) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      // На краях отдаём жест странице, иначе лента «залипает» под курсором.
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      event.preventDefault();
      el.scrollLeft += delta;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const nudge = useCallback((direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.round(el.clientWidth * 0.8),
      behavior: "smooth",
    });
  }, []);

  return { ref, edges, style: { maskImage: edgeMask(edges.left, edges.right) }, onScroll, nudge };
}
