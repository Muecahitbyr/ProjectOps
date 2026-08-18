import axios, { type AxiosResponse } from "axios";

export function toHttpErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") return "Timeout";
    if (err.code === "ENOTFOUND") return "DNS-Fehler: Host nicht gefunden";
    if (err.code === "ECONNREFUSED") return "Verbindung abgelehnt";
    return err.message;
  }
  return err instanceof Error ? err.message : "Unbekannter Fehler";
}

// validateStatus akzeptiert jeden Statuscode, damit HTTP-Fehler (4xx/5xx) vom
// Aufrufer ausgewertet werden koennen, statt eine Exception zu werfen. Nur
// unerreichbare Ziele (Timeout, DNS, Verbindung abgelehnt) werfen.
export function httpGet(target: string, timeoutMs = 5000): Promise<AxiosResponse> {
  return axios.get(target, {
    timeout: timeoutMs,
    validateStatus: () => true,
  });
}
