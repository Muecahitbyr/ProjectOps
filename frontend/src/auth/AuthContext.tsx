import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type AuthenticatedUser,
  type LoginInput,
  type RegisterInput,
} from "../api/auth.api";
import { onUnauthorized } from "../api/client";
import { reconnectRealtime } from "../realtime/realtimeClient";
import type { RoleId } from "../types/user.types";

const AUTH_QUERY_KEY = ["auth", "me"] as const;
const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

export interface AuthContextValue {
  user: AuthenticatedUser | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  loginError: string | undefined;
  registerError: string | undefined;
  isLoginPending: boolean;
  isRegisterPending: boolean;
  hasProjectRole: (projectId: string, roles: RoleId[]) => boolean;
  isGlobalAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function extractErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return error instanceof Error ? error.message : undefined;
}

// Phase 10 "Echtes Auth-System" - laedt die Sitzung beim App-Start ueber das
// httpOnly access_token-Cookie (GET /auth/me), kein Client-seitiger
// Token-Speicher. Ein 401 auf einem beliebigen anderen Endpunkt (siehe
// api/client.ts onUnauthorized) invalidiert diese Query, damit
// ProtectedRoute zuverlaessig auf /login umleitet, sobald die Sitzung
// (z.B. durch Ablauf des Refresh-Tokens) wirklich nicht mehr gueltig ist.
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => onUnauthorized(() => queryClient.setQueryData(AUTH_QUERY_KEY, undefined)), [queryClient]);

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      reconnectRealtime();
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      reconnectRealtime();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, undefined);
      queryClient.clear();
      reconnectRealtime();
    },
  });

  const value = useMemo<AuthContextValue>(() => {
    const user = meQuery.data;
    const projects = user?.projects ?? [];

    return {
      user,
      isAuthenticated: user !== undefined,
      isLoading: meQuery.isLoading,
      login: async (input) => {
        await loginMutation.mutateAsync(input);
      },
      register: async (input) => {
        await registerMutation.mutateAsync(input);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      loginError: loginMutation.error ? extractErrorMessage(loginMutation.error) : undefined,
      registerError: registerMutation.error ? extractErrorMessage(registerMutation.error) : undefined,
      isLoginPending: loginMutation.isPending,
      isRegisterPending: registerMutation.isPending,
      hasProjectRole: (projectId, roles) => {
        const membership = projects.find((project) => project.projectId === projectId);
        return membership !== undefined && roles.includes(membership.roleId);
      },
      isGlobalAdmin: projects.some((project) => MANAGE_ROLES.includes(project.roleId)),
    };
  }, [meQuery.data, meQuery.isLoading, loginMutation, registerMutation, logoutMutation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth() muss innerhalb von <AuthProvider> aufgerufen werden");
  }
  return context;
}
