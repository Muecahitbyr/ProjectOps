-- Phase 55 "Vollstaendige Projekt-Informationsintegration".
--
-- Luecke (siehe Abschlussbericht Schritt 1/4): Service Catalog (Migration
-- 0044) kennt keine strukturierte, maschinenlesbare Kennzeichnung dafuer,
-- ob ProjectOps eine Abhaengigkeit ueberhaupt extern beobachten KANN -
-- bislang nur implizit ueber "kein Check zugeordnet" + Prosa im description-
-- Feld erkennbar (z.B. "rechno - Apple Services"). Ein direkt filter-/
-- abfragbares Feld schliesst diese Luecke, ohne eine zweite Service-Catalog-
-- oder Monitoring-Engine zu bauen - derselbe CHECK-Constraint-Stil wie
-- criticality/environment/lifecycle_status (Migration 0044).
--
-- OBSERVABLE (Default) = ProjectOps hat oder kann grundsaetzlich einen
--   echten Check gegen diese Abhaengigkeit ausfuehren (auch wenn aktuell
--   z.B. mangels Credential blockiert).
-- PARTIALLY_OBSERVABLE = nur indirekt/aggregiert beobachtbar (z.B. ueber
--   Checks, die auf Projektebene statt auf diesem konkreten Service-Knoten
--   haengen).
-- NOT_OBSERVABLE = rein clientseitige/on-device Komponente ohne jede
--   Server-API, die ProjectOps von aussen prinzipiell nie pruefen kann
--   (z.B. CoreBluetooth, Apple Keychain, StoreKit intern).
ALTER TABLE services ADD COLUMN observability TEXT NOT NULL DEFAULT 'OBSERVABLE'
    CHECK (observability IN ('OBSERVABLE', 'PARTIALLY_OBSERVABLE', 'NOT_OBSERVABLE'));

CREATE INDEX idx_services_observability ON services (observability);
