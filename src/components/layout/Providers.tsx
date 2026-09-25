"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CavosProvider } from "@cavos/kit/react";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState, type ReactNode } from "react";
import { APP_MODE } from "@/config/app";
import { SessionBootstrap } from "@/features/auth/SessionBootstrap";
import { ModalHost } from "@/features/modals/ModalHost";
import { Toast } from "@/components/ui/Toast";
import { getSupabase } from "@/lib/supabase/client";

function CavosAuthBridge({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (APP_MODE !== "supabase") {
      setAuthLoading(false);
      return;
    }

    let alive = true;
    const supabase = getSupabase();
    console.log("Supabase init started");

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data.session;
        console.log("Supabase session result", {
          hasSession: Boolean(session),
          userId: session?.user?.id,
          email: session?.user?.email,
        });
        if (error) console.error("Supabase auth init error", error);
        if (alive) setUser(session?.user ?? null);
      } catch (error) {
        console.error("Supabase auth init error", error);
        if (alive) setUser(null);
      } finally {
        if (alive) setAuthLoading(false);
      }
    };

    void initAuth();

    const loadingTimeout = window.setTimeout(() => {
      if (!alive) return;
      console.error("Supabase auth init error", new Error("Supabase session lookup timed out"));
      setUser(null);
      setAuthLoading(false);
    }, 10_000);

    return () => {
      alive = false;
      window.clearTimeout(loadingTimeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  const identity =
    authLoading || !user
      ? null
      : {
          userId: user.id,
          email: user.email ?? undefined,
        };

  console.log("Supabase auth state", {
    loading: authLoading,
    userId: user?.id,
    email: user?.email,
  });
  console.log("Cavos identity", identity);

  return (
    <CavosProvider
      config={{
        appId: process.env.NEXT_PUBLIC_CAVOS_APP_ID,
        appSalt: process.env.NEXT_PUBLIC_CAVOS_APP_SALT!,
        chains: ["stellar"],
        defaultChain: "stellar",
        network: "testnet",
        environment: "development",
      }}
      identity={identity}
    >
      {children}
    </CavosProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <SessionBootstrap />
      <CavosAuthBridge>{children}</CavosAuthBridge>
      <ModalHost />
      <Toast />
    </QueryClientProvider>
  );
}
