import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";
import Chip from "@mui/material/Chip";
import { useNotificationChannels, useNotificationSettings, useUpsertNotificationSetting } from "../../hooks/useNotificationSettings";
import { useProjectsHealth } from "../../hooks/useProjects";
import { useAuth } from "../../auth/AuthContext";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type { NotificationChannelId, UserNotificationSetting } from "../../types/notification-settings.types";

interface NotificationSettingsPanelProps {
  userId: string;
}

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function findSetting(settings: UserNotificationSetting[], channelId: NotificationChannelId): UserNotificationSetting | undefined {
  return settings.find((setting) => setting.channelId === channelId);
}

// Pro Benutzer eine Zeile je Kanal (Email/Push/In-App/WebSocket) - aktiv,
// Ruhezeiten, Severity-Filter, Projekt-Filter. Existiert noch keine Zeile
// fuer einen Kanal, wird beim ersten Umschalten via upsert eine angelegt
// (siehe Repository: ON CONFLICT DO UPDATE).
export function NotificationSettingsPanel({ userId }: NotificationSettingsPanelProps) {
  const channelsQuery = useNotificationChannels();
  const settingsQuery = useNotificationSettings(userId);
  const projectsQuery = useProjectsHealth();
  const upsertMutation = useUpsertNotificationSetting(userId);
  const { user, isGlobalAdmin } = useAuth();
  const canEdit = user?.id === userId || isGlobalAdmin;

  if (channelsQuery.isLoading || settingsQuery.isLoading) {
    return <LoadingState label="Loading notification settings..." minHeight={200} />;
  }
  if (channelsQuery.isError || settingsQuery.isError) {
    return <ErrorState message={getErrorMessage(channelsQuery.error ?? settingsQuery.error)} />;
  }

  const channels = channelsQuery.data ?? [];
  const settings = settingsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  return (
    <Stack divider={<Divider />} sx={{ gap: 0 }}>
      {channels.map((channel) => {
        const setting = findSetting(settings, channel.id);
        const enabled = setting?.enabled ?? false;
        const severityFilter = setting?.severityFilter ?? [];
        const projectFilter = setting?.projectFilter ?? [];

        const patch = (partial: Partial<UserNotificationSetting>): void => {
          upsertMutation.mutate({
            userId,
            channelId: channel.id,
            enabled,
            quietHoursStart: setting?.quietHoursStart ?? null,
            quietHoursEnd: setting?.quietHoursEnd ?? null,
            severityFilter,
            projectFilter,
            ...partial,
          });
        };

        return (
          <Box key={channel.id} sx={{ py: 2 }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: enabled ? 1.5 : 0 }}>
              <Box>
                <Typography variant="body1">{channel.id}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {channel.description}
                </Typography>
              </Box>
              <Switch checked={enabled} disabled={!canEdit} onChange={(event) => patch({ enabled: event.target.checked })} />
            </Stack>

            {enabled ? (
              <Stack sx={{ gap: 2 }}>
                <Stack direction="row" sx={{ gap: 2 }}>
                  <TextField
                    label="Quiet hours start"
                    type="number"
                    size="small"
                    disabled={!canEdit}
                    value={setting?.quietHoursStart ?? ""}
                    slotProps={{ htmlInput: { min: 0, max: 23 } }}
                    onChange={(event) =>
                      patch({ quietHoursStart: event.target.value === "" ? null : Number(event.target.value) })
                    }
                    sx={{ width: 160 }}
                  />
                  <TextField
                    label="Quiet hours end"
                    type="number"
                    size="small"
                    disabled={!canEdit}
                    value={setting?.quietHoursEnd ?? ""}
                    slotProps={{ htmlInput: { min: 0, max: 23 } }}
                    onChange={(event) =>
                      patch({ quietHoursEnd: event.target.value === "" ? null : Number(event.target.value) })
                    }
                    sx={{ width: 160 }}
                  />
                </Stack>

                <Select<string[]>
                  multiple
                  size="small"
                  displayEmpty
                  disabled={!canEdit}
                  value={severityFilter}
                  onChange={(event: SelectChangeEvent<string[]>) =>
                    patch({
                      severityFilter: typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value,
                    })
                  }
                  renderValue={(selected) =>
                    selected.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        All severities
                      </Typography>
                    ) : (
                      <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
                        {selected.map((value) => (
                          <Chip key={value} size="small" label={value} />
                        ))}
                      </Stack>
                    )
                  }
                >
                  {SEVERITIES.map((severity) => (
                    <MenuItem key={severity} value={severity}>
                      {severity}
                    </MenuItem>
                  ))}
                </Select>

                <Select<string[]>
                  multiple
                  size="small"
                  displayEmpty
                  disabled={!canEdit}
                  value={projectFilter}
                  onChange={(event: SelectChangeEvent<string[]>) =>
                    patch({
                      projectFilter: typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value,
                    })
                  }
                  renderValue={(selected) =>
                    selected.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        All projects
                      </Typography>
                    ) : (
                      <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
                        {selected.map((projectId) => (
                          <Chip
                            key={projectId}
                            size="small"
                            label={projects.find((project) => project.id === projectId)?.name ?? projectId}
                          />
                        ))}
                      </Stack>
                    )
                  }
                >
                  {projects.map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                      {project.name}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}
