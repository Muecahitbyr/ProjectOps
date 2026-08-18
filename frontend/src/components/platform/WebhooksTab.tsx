import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { useOrganizations } from "../../hooks/useOrganizations";
import { useCreateWebhook, useDeleteWebhook, useSetWebhookEnabled, useWebhookDeliveries, useWebhooks } from "../../hooks/useWebhooks";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDateTime } from "../../utils/formatters";
import { healthStatusColors } from "../../theme/statusColors";
import { WEBHOOK_EVENT_TYPES } from "../../types/webhook.types";
import type { WebhookEventType } from "../../types/webhook.types";

function WebhookDeliveries({ webhookId }: { webhookId: string }) {
  const deliveriesQuery = useWebhookDeliveries(webhookId);
  if (deliveriesQuery.isLoading) return <LoadingState label="Loading deliveries..." minHeight={80} />;
  if (deliveriesQuery.isError || !deliveriesQuery.data) return <ErrorState message="Could not load deliveries." minHeight={80} />;
  if (deliveriesQuery.data.length === 0) return <EmptyState message="No deliveries yet." minHeight={80} />;

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Event</TableCell>
          <TableCell>Status</TableCell>
          <TableCell align="right">Attempts</TableCell>
          <TableCell align="right">Response</TableCell>
          <TableCell>Last Attempt</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {deliveriesQuery.data.map((delivery) => (
          <TableRow key={delivery.id}>
            <TableCell>{delivery.eventType}</TableCell>
            <TableCell>
              <Chip
                size="small"
                label={delivery.status}
                sx={{
                  backgroundColor: `${delivery.status === "DELIVERED" ? healthStatusColors.healthy : delivery.status === "DEAD_LETTER" ? healthStatusColors.critical : healthStatusColors.warning}1f`,
                  color: delivery.status === "DELIVERED" ? healthStatusColors.healthy : delivery.status === "DEAD_LETTER" ? healthStatusColors.critical : healthStatusColors.warning,
                }}
              />
            </TableCell>
            <TableCell align="right">{delivery.attemptCount}</TableCell>
            <TableCell align="right">{delivery.responseStatus ?? "—"}</TableCell>
            <TableCell>{formatDateTime(delivery.deliveredAt ?? delivery.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Phase 15 Teil 7 "Webhooks" - Signierung/Retry/Dead-Letter-Queue laufen im
// Backend (core/webhook-delivery.ts, verarbeitet vom bestehenden Scheduler-
// Tick); diese Seite verwaltet nur Konfiguration + zeigt die echte
// Zustellungshistorie.
export function WebhooksTab() {
  const [organizationId, setOrganizationId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventType[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const organizationsQuery = useOrganizations();
  const webhooksQuery = useWebhooks(organizationId || undefined);
  const createMutation = useCreateWebhook();
  const toggleMutation = useSetWebhookEnabled(organizationId || undefined);
  const deleteMutation = useDeleteWebhook(organizationId || undefined);

  const handleClose = (): void => {
    setDialogOpen(false);
    setUrl("");
    setEvents([]);
    createMutation.reset();
  };

  return (
    <Stack sx={{ gap: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <TextField select label="Organization" size="small" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">Select an organization</MenuItem>
          {(organizationsQuery.data ?? []).map((org) => (
            <MenuItem key={org.id} value={org.id}>
              {org.name}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} disabled={!organizationId} onClick={() => setDialogOpen(true)}>
          New webhook
        </Button>
      </Stack>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its webhooks." minHeight={200} />
      ) : webhooksQuery.isLoading ? (
        <LoadingState label="Loading webhooks..." minHeight={200} />
      ) : webhooksQuery.isError || !webhooksQuery.data ? (
        <ErrorState message={getErrorMessage(webhooksQuery.error)} onRetry={() => webhooksQuery.refetch()} minHeight={200} />
      ) : webhooksQuery.data.length === 0 ? (
        <EmptyState message="No webhooks yet." minHeight={200} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          {webhooksQuery.data.map((webhook) => (
            <Card key={webhook.id}>
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography variant="h4" sx={{ wordBreak: "break-all" }}>
                      {webhook.url}
                    </Typography>
                    <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                      {webhook.events.map((event) => (
                        <Chip key={event} size="small" variant="outlined" label={event} />
                      ))}
                    </Stack>
                  </Stack>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <Switch checked={webhook.enabled} onChange={(event) => toggleMutation.mutate({ id: webhook.id, enabled: event.target.checked })} />
                    <IconButton size="small" onClick={() => deleteMutation.mutate(webhook.id)} aria-label="Delete webhook">
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
                <Button size="small" sx={{ mt: 1 }} onClick={() => setExpandedId((current) => (current === webhook.id ? null : webhook.id))}>
                  {expandedId === webhook.id ? "Hide deliveries" : "Show deliveries"}
                </Button>
                {expandedId === webhook.id ? <WebhookDeliveries webhookId={webhook.id} /> : null}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>New webhook</DialogTitle>
        <DialogContent>
          {createMutation.data ? (
            <Stack sx={{ gap: 2, pt: 1 }}>
              <Alert severity="warning">This signing secret is shown only once. Use it to verify the X-ProjectOps-Signature header.</Alert>
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <TextField label="Signing Secret" value={createMutation.data.plaintextSecret} fullWidth slotProps={{ input: { readOnly: true } }} />
                <IconButton onClick={() => void navigator.clipboard.writeText(createMutation.data!.plaintextSecret)} aria-label="Copy secret">
                  <ContentCopyOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          ) : (
            <Stack sx={{ gap: 2, pt: 1 }}>
              <TextField label="URL" value={url} onChange={(event) => setUrl(event.target.value)} autoFocus fullWidth placeholder="https://example.com/webhook" />
              <TextField
                select
                label="Events"
                value={events}
                onChange={(event) => setEvents(event.target.value as unknown as WebhookEventType[])}
                fullWidth
                slotProps={{ select: { multiple: true } }}
              >
                {WEBHOOK_EVENT_TYPES.map((event) => (
                  <MenuItem key={event} value={event}>
                    {event}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {createMutation.data ? (
            <Button variant="contained" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                variant="contained"
                disabled={!url.trim() || events.length === 0 || createMutation.isPending}
                onClick={() => createMutation.mutate({ organizationId, url: url.trim(), events })}
              >
                Create
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
