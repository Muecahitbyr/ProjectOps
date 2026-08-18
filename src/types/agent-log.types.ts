export type AgentLogLevel = "INFO" | "WARN" | "ERROR";

export interface AgentLogEntry {
  id: number;
  agentId: string;
  projectId: string | null;
  checkId: string | null;
  level: AgentLogLevel;
  category: string;
  message: string;
  createdAt: string;
}

export interface CreateAgentLogInput {
  agentId: string;
  projectId?: string;
  checkId?: string;
  level: AgentLogLevel;
  category: string;
  message: string;
}
