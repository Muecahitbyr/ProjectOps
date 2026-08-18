import axios from "axios";

// Einziger Axios-Client der Anwendung - Komponenten rufen nie fetch/axios
// direkt auf, sondern immer ueber die *.api.ts-Module in diesem Ordner.
//
// Phase 10: ersetzt den X-User-Id-Header aus Phase 9 (Acting-as/UserSwitcher,
// entfernt) - withCredentials sendet/empfaengt die httpOnly Auth-Cookies
// (access_token/refresh_token, siehe backend config/auth.config.ts), die
// Identitaet kommt jetzt ausschliesslich vom Server verifiziert zurueck.
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10_000,
  withCredentials: true,
});

// Ein 401 auf /auth/me oder /auth/refresh bedeutet "nicht angemeldet" - kein
// Redirect-Loop-Risiko, da AuthContext genau diese beiden Endpunkte selbst
// aufruft und den 401 als "nicht eingeloggt" interpretiert. Fuer alle
// anderen Endpunkte informiert ein globaler Listener (siehe AuthContext)
// die App, dass die Sitzung abgelaufen ist, ohne dass jede Seite einzeln
// auf 401 pruefen muss.
export type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

const AUTH_ENDPOINTS = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/me"];

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? "";
      const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));
      if (!isAuthEndpoint) {
        unauthorizedListeners.forEach((listener) => listener());
      }
    }
    return Promise.reject(error);
  },
);
