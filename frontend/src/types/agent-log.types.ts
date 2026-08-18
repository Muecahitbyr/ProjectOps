export type AgentLogLevel = "INFO" | "WARN" | "ERROR";

export interface AgentLogEntry {
  id: string;
  agentId: string;
  projectId: string | null;
  checkId: string | null;
  level: AgentLogLevel;
  category: string;
  message: string;
  createdAt: string;
}
