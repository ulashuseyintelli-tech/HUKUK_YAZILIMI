"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  surname: string;
  role: string;
  tenantId: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug: string, rememberMe: boolean) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AUTH-01: /auth/account-recovery eklendi — girişsiz kullanıcı erişebilmeli.
const PUBLIC_PATHS = ["/", "/auth/login", "/auth/register", "/auth/account-recovery"];
// Girişli kullanıcı bu sayfalara düşerse panele yönlendirilir (pazarlama/login sayfasında kalmamalı).
const REDIRECT_WHEN_AUTHENTICATED_PATHS = ["/", "/auth/login"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // CLIENT-P2-U01-R1: /portal/* namespace staff-auth redirect katmanından muaf — kendi
    // ayrı portal-specific auth katmanına (PortalLayout'un portal_token guard'ı) devredilir.
    // Bütün portal route'ları public OLMAZ: private /portal/* route'ları PortalLayout'un
    // kendi guard'ı korur (bkz. app/portal/layout.tsx).
    const isPortalDelegated = pathname.startsWith("/portal");
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname) && !isPortalDelegated) {
      router.push("/auth/login");
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    if (!loading && user && REDIRECT_WHEN_AUTHENTICATED_PATHS.includes(pathname)) {
      router.push("/dashboard");
    }
  }, [loading, user, pathname, router]);

  const checkAuth = async () => {
    const token = api.getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.me();
      setUser(response.user);
      setTenant(response.user?.tenant || null);
    } catch {
      api.clearToken();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string, tenantSlug: string, rememberMe: boolean) => {
    const response = await api.login(email, password, tenantSlug, rememberMe);
    setUser(response.user);
    setTenant(response.tenant);
    router.push("/dashboard");
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
    setTenant(null);
    router.push("/auth/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
