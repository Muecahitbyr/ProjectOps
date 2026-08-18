import type { NextFunction, Request, Response } from "express";
import { getUserRoleForProject, isGlobalAdmin } from "../db/users.repository";
import { getOrganizationMembership, isPlatformOwner } from "../db/organizations.repository";
import { authRequiredError, forbiddenError, notFoundError } from "../core/app-error";
import { setRequestProjectId } from "../core/request-context";
import type { RoleId } from "../types/user.types";
import type { OrganizationRoleId } from "../types/organization.types";

export type ResolveProjectId = (req: Request) => Promise<string | undefined> | string | undefined;

// Auftragspunkt 2 "Security Middleware". Muss nach authenticate() laufen
// (braucht req.userId). Ersetzt middleware/require-project-role.ts (Phase 9,
// X-User-Id-basiert) durch dieselbe Rollenlogik auf Basis der jetzt echten,
// verifizierten Identitaet.
function requireAuthenticatedUserId(req: Request): string {
  if (!req.userId) {
    throw authRequiredError();
  }
  return req.userId;
}

// Nur Mitgliedschaft noetig (jede Rolle inkl. VIEWER) - fuer lesende,
// projektbezogene Endpunkte ("VIEWER: nur lesen" ist trotzdem lesen
// erlaubt).
export function authorizeProjectAccess(resolveProjectId: ResolveProjectId) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    const projectId = await resolveProjectId(req);
    if (!projectId) {
      throw notFoundError("Projekt nicht gefunden");
    }
    setRequestProjectId(projectId);

    const role = await getUserRoleForProject(userId, projectId);
    if (!role) {
      throw forbiddenError("Kein Mitglied dieses Projekts");
    }
    next();
  };
}

// Nur eine der angegebenen Rollen genuegt (z.B. ['OWNER', 'ADMIN']) - fuer
// schreibende, projektbezogene Endpunkte.
export function authorizeRole(allowedRoles: RoleId[], resolveProjectId: ResolveProjectId) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    const projectId = await resolveProjectId(req);
    if (!projectId) {
      throw notFoundError("Projekt nicht gefunden");
    }
    setRequestProjectId(projectId);

    const role = await getUserRoleForProject(userId, projectId);
    if (!role || !allowedRoles.includes(role)) {
      throw forbiddenError(`Nur ${allowedRoles.join("/")} dieses Projekts duerfen diese Aktion ausfuehren`);
    }
    next();
  };
}

// Fuer Aktionen ohne einzelnes Projekt im Kontext (z.B. Benutzerverwaltung) -
// siehe isGlobalAdmin() in db/users.repository.ts.
export function authorizeGlobalAdmin() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    if (!(await isGlobalAdmin(userId))) {
      throw forbiddenError("Nur OWNER/ADMIN eines Projekts duerfen diese Aktion ausfuehren");
    }
    next();
  };
}

export type ResolveOrganizationId = (req: Request) => Promise<string | undefined> | string | undefined;

// Phase 24 - fuer authorizePlatformOr Organization{Membership,Role}() unten:
// `undefined` bedeutet "keine organizationId angegeben" (z.B. eine
// Listenabfrage ohne Filter - der Bootstrap-Zweig greift). `null` bedeutet
// dagegen "eine KONKRETE Ressourcen-ID wurde angegeben, existiert aber
// nicht/ist ungueltig" - live im eigenen E2E-Test gefundener Bug: ohne diese
// Unterscheidung fiel GET /on-call/schedules/999999999 (und dieselbe
// vorbestehende Luecke bereits in platform-slo.routes.ts/platform-services.
// routes.ts) in den Bootstrap-Zweig und lieferte 403 statt 404 - ein
// Existenz-Leak UND eine Abweichung vom etablierten Muster "404 statt 403,
// kein Existenz-Leak" (siehe routes/v1/slo.routes.ts#assertSloVisible).
// Bei `null` wird die Pruefung hier komplett uebersprungen (next()) - der
// Handler laedt die Ressource ohnehin erneut und liefert bereits selbst
// notFoundError() bei Nichtexistenz, siehe z.B. platformSloRouter.get(".../:id").
export type ResolveOrganizationIdOrNotFound = (req: Request) => Promise<string | null | undefined> | string | null | undefined;

// Phase 15 "Multi-Tenant Architektur" - dieselbe Struktur wie
// authorizeRole() oben, aber auf der NEUEN, unabhaengigen Organisations-
// Rollen-Dimension (organization_members.role_id, siehe
// types/organization.types.ts) statt project_members.role_id.
export function authorizeOrganizationRole(allowedRoles: OrganizationRoleId[], resolveOrganizationId: ResolveOrganizationId) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    const organizationId = await resolveOrganizationId(req);
    if (!organizationId) {
      throw notFoundError("Organisation nicht gefunden");
    }

    const role = await getOrganizationMembership(organizationId, userId);
    if ((!role || !allowedRoles.includes(role)) && !(await isPlatformOwner(userId))) {
      throw forbiddenError(`Nur ${allowedRoles.join("/")} dieser Organisation duerfen diese Aktion ausfuehren`);
    }
    next();
  };
}

export function authorizeOrganizationMembership(resolveOrganizationId: ResolveOrganizationId) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    const organizationId = await resolveOrganizationId(req);
    if (!organizationId) {
      throw notFoundError("Organisation nicht gefunden");
    }

    const role = await getOrganizationMembership(organizationId, userId);
    if (!role && !(await isPlatformOwner(userId))) {
      throw forbiddenError("Kein Mitglied dieser Organisation");
    }
    next();
  };
}

// Auftragspunkt 9 "Global Administration" - bewusst mit Fallback auf
// authorizeGlobalAdmin() statt ausschliesslich PLATFORM_OWNER zu verlangen:
// direkt nach der Migration existiert i.d.R. noch kein echter
// PLATFORM_OWNER (dieser wird bewusst nicht automatisch vergeben, siehe
// Migration 0033), ohne Fallback waere die Platform-Administration-Seite
// fuer niemanden erreichbar.
export function authorizePlatformOwner() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    if (!(await isPlatformOwner(userId)) && !(await isGlobalAdmin(userId))) {
      throw forbiddenError("Nur Platform Owner duerfen diese Aktion ausfuehren");
    }
    next();
  };
}

// Phase 24 - echter, live bestaetigter Cross-Tenant-Bug: routes/platform-slo.
// routes.ts und routes/platform-services.routes.ts (Phase 22/23) pruefen fuer
// JEDEN Endpunkt ausschliesslich authorizePlatformOwner() - dessen
// isGlobalAdmin()-Fallback bedeutet "OWNER/ADMIN auf IRGENDEINEM (auch
// organisationsfremden) Projekt", voellig unabhaengig von der konkreten
// organizationId im Request. Live nachgestellt: ein Nutzer, der nur OWNER
// eines einzelnen Projekts in "Default Organization" war (keinerlei
// Mitgliedschaft in der Ziel-Organisation), konnte damit SLOs einer FREMDEN
// Organisation per GET/POST/PATCH/DELETE lesen und sogar loeschen (siehe
// Phase-24-Abschlussbericht, Sicherheit). Diese Funktionen schliessen die
// Luecke, OHNE die bestehende, bewusst gewaehlte "Uebersicht ueber ALLE
// Organisationen" fuer echte Platform-Owner/Bootstrap-Admins zu entfernen
// (siehe z.B. SloOverview.tsx "Alle Organisationen"-Filter): fehlt eine
// organizationId (z.B. bei einer Listenabfrage ohne Filter), gilt weiterhin
// exakt die bisherige authorizePlatformOwner()-Regel. Ist eine konkrete
// organizationId angegeben (Query/Body) oder aus der geladenen Ressource
// aufgeloest (z.B. das Team/den Service selbst), MUSS der Aufrufer echtes
// Mitglied GENAU DIESER Organisation sein (oder echter isPlatformOwner()) -
// der zu breite isGlobalAdmin()-Fallback greift dann NICHT mehr.
export function authorizePlatformOrOrganizationMembership(resolveOrganizationId: ResolveOrganizationIdOrNotFound) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    const organizationId = await resolveOrganizationId(req);
    if (organizationId === null) {
      next();
      return;
    }
    if (!organizationId) {
      if (!(await isPlatformOwner(userId)) && !(await isGlobalAdmin(userId))) {
        throw forbiddenError("Nur Platform Owner duerfen diese Aktion ausfuehren");
      }
      next();
      return;
    }
    const role = await getOrganizationMembership(organizationId, userId);
    if (!role && !(await isPlatformOwner(userId))) {
      throw forbiddenError("Kein Mitglied dieser Organisation");
    }
    next();
  };
}

// Schreibende Variante von authorizePlatformOrOrganizationMembership() oben -
// verlangt zusaetzlich eine der angegebenen Rollen, sobald eine konkrete
// organizationId vorliegt (Erstellen/Aendern/Loeschen setzt IMMER eine
// organizationId voraus, der Bootstrap-Zweig greift hier de facto nur bei
// rein plattformweiten Aktionen ohne Organisationsbezug).
export function authorizePlatformOrOrganizationRole(allowedRoles: OrganizationRoleId[], resolveOrganizationId: ResolveOrganizationIdOrNotFound) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    const organizationId = await resolveOrganizationId(req);
    if (organizationId === null) {
      next();
      return;
    }
    if (!organizationId) {
      if (!(await isPlatformOwner(userId)) && !(await isGlobalAdmin(userId))) {
        throw forbiddenError("Nur Platform Owner duerfen diese Aktion ausfuehren");
      }
      next();
      return;
    }
    const role = await getOrganizationMembership(organizationId, userId);
    if ((!role || !allowedRoles.includes(role)) && !(await isPlatformOwner(userId))) {
      throw forbiddenError(`Nur ${allowedRoles.join("/")} dieser Organisation duerfen diese Aktion ausfuehren`);
    }
    next();
  };
}
