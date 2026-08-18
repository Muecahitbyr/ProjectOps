import { Router } from "express";
import { z } from "zod";
import { AUTOMATION_TEMPLATES, getAutomationTemplateById } from "../automation/automation-templates";
import { createAutomationRule } from "../db/automation-rules.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeRole } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";
import type { RoleId } from "../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

export const automationTemplatesRouter = Router();

// Teil 5 "Automation Templates" - reine Lese-Liste der Vorlagen (keine
// Autorisierung noetig, es werden keine Projektdaten preisgegeben).
automationTemplatesRouter.get("/automation-templates", authenticate, (_req, res) => {
  res.json(AUTOMATION_TEMPLATES);
});

const applySchema = z.object({ projectId: z.string().trim().min(1) });

async function resolveProjectIdFromBody(req: import("express").Request): Promise<string | undefined> {
  return typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
}

// Erzeugt aus einer Vorlage eine konkrete automation_rules-Zeile fuer das
// angegebene Projekt - "Templates erzeugen automatisch Rules" (Teil 5).
automationTemplatesRouter.post(
  "/automation-templates/:id/apply",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromBody),
  async (req, res) => {
    const template = getAutomationTemplateById(req.params.id as string);
    if (!template) {
      throw notFoundError("Vorlage nicht gefunden");
    }

    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const rule = await createAutomationRule({
      projectId: parsed.data.projectId,
      name: template.name,
      minSeverity: template.minSeverity,
      trigger: template.trigger,
      priority: template.priority,
      action: template.action,
      autoExecute: template.autoExecute,
      approvalRequired: template.approvalRequired,
      cooldownMinutes: template.cooldownMinutes,
      maxExecutionsPerHour: template.maxExecutionsPerHour,
      enabled: true,
      ...(template.conditions ? { conditions: template.conditions } : {}),
      ...(req.userId !== undefined ? { createdBy: req.userId } : {}),
    });

    res.status(201).json(rule);
  },
);
