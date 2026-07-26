"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useSyncExternalStore, type ReactNode } from "react";

const noopSubscribe = () => () => {};

/**
 * false на сервере и в первом клиентском рендере, дальше true. Нужен всему,
 * что зависит от браузера (тема, localStorage, navigator) — без него
 * гидратация расходится. Через useSyncExternalStore, а не эффект: так не
 * возникает лишнего каскадного рендера.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function Providers({ children }: { children: ReactNode }) {
  // Клиент создаётся лениво и живёт внутри дерева: один общий инстанс на
  // модуль протёк бы между запросами при SSR.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
