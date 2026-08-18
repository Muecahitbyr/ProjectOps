import type { CheckConfig, CheckType, ProjectConfig } from "../types/project.types";
import type { CheckResult } from "../types/check-result.types";

export interface Checker {
  readonly type: CheckType;
  run(project: ProjectConfig, check: CheckConfig): Promise<CheckResult>;
}
