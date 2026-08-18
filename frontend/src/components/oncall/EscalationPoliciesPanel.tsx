import { useState } from "react";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import {
  useCreateEscalationPolicy,
  useDeleteEscalationPolicy,
  useEscalationPolicies,
  useReplaceEscalationPolicySteps,
  useUpdateEscalationPolicy,
} from "../../hooks/useEscalationPolicies";
import { useOnCallSchedules } from "../../hooks/useOnCall";
import { useUsers } from "../../hooks/useUsers";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type { EscalationPolicyWithSteps, EscalationTargetType } from "../../types/escalation-policy.types";

// Phase 27 "Enterprise On-Call & Escalation Management" - eigenstaendiges
// Panel (analog zu DeploymentsPanel/ProjectMembersPanel), direkt in
// OnCall.tsx eingebettet statt einer eigenen Unterseite - die Anzahl an
// Policies ist durch die Plan-Quota klein genug (siehe config/plan-limits.ts),
// dieselbe Begruendung wie bei On-Call-Schedules selbst.
export function EscalationPoliciesPanel({ organizationId }: { organizationId: string }) {
  const policiesQuery = useEscalationPolicies(organizationId || undefined);
  const createMutation = useCreateEscalationPolicy();
  const deleteMutation = useDeleteEscalationPolicy();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EscalationPolicyWithSteps | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const policies = policiesQuery.data ?? [];
  const selected = policies.find((p) => p.id === selectedId) ?? null;

  if (!organizationId) return null;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h3">Escalation Policies</Typography>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            New policy
          </Button>
        </Stack>

        {policiesQuery.isLoading ? (
          <LoadingState minHeight={120} />
        ) : policiesQuery.isError ? (
          <ErrorState message={getErrorMessage(policiesQuery.error)} onRetry={() => policiesQuery.refetch()} minHeight={120} />
        ) : policies.length === 0 ? (
          <EmptyState message="No escalation policies yet." minHeight={120} />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Steps</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id} hover selected={selectedId === policy.id} sx={{ cursor: "pointer" }} onClick={() => setSelectedId(policy.id)}>
                    <TableCell>
                      <Typography variant="body2">{policy.name}</Typography>
                      {policy.description ? (
                        <Typography variant="caption" color="text.secondary">
                          {policy.description}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>{policy.steps.length}</TableCell>
                    <TableCell>
                      <Chip size="small" label={policy.enabled ? "ENABLED" : "DISABLED"} color={policy.enabled ? "success" : "default"} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label="Delete policy"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(policy);
                        }}
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      {selected ? <PolicyStepsEditor policy={selected} organizationId={organizationId} /> : null}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New escalation policy</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, mt: 1 }}>
            <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <TextField label="Description (optional)" size="small" multiline minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            {createMutation.isError ? <Alert severity="error">{getErrorMessage(createMutation.error)}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!name.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate(
                { organizationId, name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
                { onSuccess: (policy) => { setCreateOpen(false); setName(""); setDescription(""); setSelectedId(policy.id); } },
              )
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete policy "{deleteTarget?.name}"?</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            This permanently deletes the policy and its steps. Services using it will keep working but stop escalating incidents. This cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (!deleteTarget) return;
              deleteMutation.mutate(
                { id: deleteTarget.id, organizationId },
                { onSuccess: () => { if (selectedId === deleteTarget.id) setSelectedId(null); setDeleteTarget(null); } },
              );
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

interface DraftStep {
  stepOrder: number;
  delayMinutes: number;
  targetType: EscalationTargetType;
  targetUserId: string;
  targetScheduleId: string;
}

function PolicyStepsEditor({ policy, organizationId }: { policy: EscalationPolicyWithSteps; organizationId: string }) {
  const usersQuery = useUsers();
  const schedulesQuery = useOnCallSchedules({ organizationId });
  const replaceMutation = useReplaceEscalationPolicySteps();
  const updateMutation = useUpdateEscalationPolicy();

  const [steps, setSteps] = useState<DraftStep[]>(() =>
    policy.steps.map((s) => ({
      stepOrder: s.stepOrder,
      delayMinutes: s.delayMinutes,
      targetType: s.targetType,
      targetUserId: s.targetUserId ?? "",
      targetScheduleId: s.targetScheduleId ? String(s.targetScheduleId) : "",
    })),
  );

  function addStep() {
    setSteps((prev) => [...prev, { stepOrder: prev.length + 1, delayMinutes: 15, targetType: "USER", targetUserId: "", targetScheduleId: "" }]);
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepOrder: i + 1 })));
  }
  function updateStep(index: number, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  const isValid = steps.every((s) => (s.targetType === "USER" ? Boolean(s.targetUserId) : Boolean(s.targetScheduleId)));

  return (
    <CardContent sx={{ borderTop: "1px solid", borderColor: "divider" }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Steps for "{policy.name}"</Typography>
        <Stack direction="row" sx={{ gap: 1, alignItems: "center" }}>
          <Chip
            size="small"
            label={policy.enabled ? "Enabled" : "Disabled"}
            onClick={() => updateMutation.mutate({ id: policy.id, input: { enabled: !policy.enabled } })}
            color={policy.enabled ? "success" : "default"}
            variant="outlined"
            sx={{ cursor: "pointer" }}
          />
          <Button size="small" startIcon={<AddIcon />} onClick={addStep}>
            Add step
          </Button>
        </Stack>
      </Stack>

      {steps.length === 0 ? <EmptyState message="No steps configured - this policy never escalates." minHeight={80} /> : null}

      <Stack sx={{ gap: 1.5 }}>
        {steps.map((step, index) => (
          <Stack key={index} direction="row" sx={{ gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ minWidth: 24 }}>
              #{step.stepOrder}
            </Typography>
            <TextField
              label="Delay (min)"
              type="number"
              size="small"
              value={step.delayMinutes}
              onChange={(e) => updateStep(index, { delayMinutes: Math.max(0, Number(e.target.value)) })}
              sx={{ width: 130 }}
            />
            <TextField
              select
              label="Target type"
              size="small"
              value={step.targetType}
              onChange={(e) => updateStep(index, { targetType: e.target.value as EscalationTargetType, targetUserId: "", targetScheduleId: "" })}
              sx={{ width: 170 }}
            >
              <MenuItem value="USER">User</MenuItem>
              <MenuItem value="ON_CALL_SCHEDULE">On-call schedule</MenuItem>
            </TextField>
            {step.targetType === "USER" ? (
              <TextField
                select
                label="User"
                size="small"
                value={step.targetUserId}
                onChange={(e) => updateStep(index, { targetUserId: e.target.value })}
                sx={{ minWidth: 200 }}
              >
                {(usersQuery.data ?? []).map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                select
                label="Schedule"
                size="small"
                value={step.targetScheduleId}
                onChange={(e) => updateStep(index, { targetScheduleId: e.target.value })}
                sx={{ minWidth: 200 }}
              >
                {(schedulesQuery.data ?? []).map((s) => (
                  <MenuItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <IconButton size="small" aria-label="Remove step" onClick={() => removeStep(index)}>
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" sx={{ mt: 2, gap: 2, alignItems: "center" }}>
        <Button
          variant="contained"
          disabled={!isValid || replaceMutation.isPending}
          onClick={() =>
            replaceMutation.mutate({
              id: policy.id,
              steps: steps.map((s) => ({
                stepOrder: s.stepOrder,
                delayMinutes: s.delayMinutes,
                targetType: s.targetType,
                ...(s.targetType === "USER" ? { targetUserId: s.targetUserId } : { targetScheduleId: Number(s.targetScheduleId) }),
              })),
            })
          }
        >
          Save steps
        </Button>
        {replaceMutation.isError ? <Alert severity="error">{getErrorMessage(replaceMutation.error)}</Alert> : null}
        {replaceMutation.isSuccess ? (
          <Typography variant="caption" color="success.main">
            Saved.
          </Typography>
        ) : null}
      </Stack>
    </CardContent>
  );
}
