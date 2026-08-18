import { AsyncLocalStorage } from "node:async_hooks";

// Traegt requestId/userId/projectId ueber eine gesamte Anfrage hinweg, ohne
// sie manuell durch jede Funktion reichen zu muessen - logger.ts liest den
// aktuellen Kontext automatisch mit (siehe dort). projectId wird von
// einzelnen Routen optional gesetzt (z.B. sobald ein :id-Parameter aufgeloest
// wurde), userId von middleware/authenticate.ts nach erfolgreicher Pruefung.
export interface RequestContext {
  requestId: string;
  userId?: string;
  projectId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setRequestUserId(userId: string): void {
  const context = storage.getStore();
  if (context) {
    context.userId = userId;
  }
}

export function setRequestProjectId(projectId: string): void {
  const context = storage.getStore();
  if (context) {
    context.projectId = projectId;
  }
}
