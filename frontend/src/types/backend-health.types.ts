export interface BackendHealth {
  status: string;
  uptime: number;
  database: "connected" | "disconnected";
  timestamp: string;
}
