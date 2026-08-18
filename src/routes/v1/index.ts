import { Router } from "express";
import { v1ProjectsRouter } from "./projects.routes";
import { v1IncidentsRouter } from "./incidents.routes";
import { v1AnalyticsRouter } from "./analytics.routes";
import { v1AlertsRouter } from "./alerts.routes";
import { v1AutomationRouter } from "./automation.routes";
import { v1AutomationRulesRouter } from "./automation-rules.routes";
import { v1ApiKeysRouter } from "./api-keys.routes";
import { v1UsageRouter } from "./usage.routes";
import { v1HealthRouter } from "./health.routes";
import { v1SloRouter } from "./slo.routes";
import { v1ServicesRouter } from "./services.routes";
import { v1OnCallRouter } from "./on-call.routes";
import { v1ChangesRouter } from "./changes.routes";
import { v1DeploymentsRouter } from "./deployments.routes";
import { v1ResilienceRouter } from "./resilience.routes";

// Phase 16 Auftragspunkt 3 "Echte externe API" - eigener, klar
// abgegrenzter Router fuer /api/v1 (API-Key-authentifiziert, siehe
// middleware/api-key-auth.ts), strikt getrennt von den bestehenden
// Browser-Session-authentifizierten /api-Routen. Wird wie alle anderen
// Router in index.ts unter dem "/api"-Praefix gemountet (jeder
// Einzelrouter deklariert seinen Pfad bereits inklusive "/v1/...").
export const v1Router = Router();
v1Router.use(v1ProjectsRouter);
v1Router.use(v1IncidentsRouter);
v1Router.use(v1AnalyticsRouter);
v1Router.use(v1AlertsRouter);
v1Router.use(v1AutomationRouter);
v1Router.use(v1AutomationRulesRouter);
v1Router.use(v1ApiKeysRouter);
v1Router.use(v1UsageRouter);
v1Router.use(v1HealthRouter);
v1Router.use(v1SloRouter);
v1Router.use(v1ServicesRouter);
v1Router.use(v1OnCallRouter);
v1Router.use(v1ChangesRouter);
v1Router.use(v1DeploymentsRouter);
v1Router.use(v1ResilienceRouter);
