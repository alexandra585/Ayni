"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CavosProvider } from "@cavos/kit/react";
import { useState, type ReactNode } from "react";
import { SessionBootstrap } from "@/features/auth/SessionBootstrap";
import { ModalHost } from "@/features/modals/ModalHost";
import { Toast } from "@/components/ui/Toast";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <SessionBootstrap />
      <CavosProvider
        config={{
          appId: process.env.NEXT_PUBLIC_CAVOS_APP_ID,
          appSalt: process.env.NEXT_PUBLIC_CAVOS_APP_SALT!,
          chains: ["stellar"],
          defaultChain: "stellar",
          network: "testnet",
          environment: "development",
        }}
        modal={{
          appName: "Ayni",
          providers: ["email", "google"],
        }}
      >
        {children}
        <ModalHost />
      </CavosProvider>
      <Toast />
    </QueryClientProvider>
  );
}
