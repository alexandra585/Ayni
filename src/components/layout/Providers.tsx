"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SessionBootstrap } from "@/features/auth/SessionBootstrap";
import { ModalHost } from "@/features/modals/ModalHost";
import { Toast } from "@/components/ui/Toast";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <SessionBootstrap />
      {children}
      <ModalHost />
      <Toast />
    </QueryClientProvider>
  );
}
