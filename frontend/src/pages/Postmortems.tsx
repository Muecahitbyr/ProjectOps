import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Chip from "@mui/material/Chip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { usePostmortems } from "../hooks/usePostmortems";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDateTime } from "../utils/formatters";
import { POSTMORTEM_STATUSES } from "../types/postmortem.types";
import type { PostmortemStatus } from "../types/postmortem.types";

const STATUS_LABELS: Record<PostmortemStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
};

const STATUS_COLOR: Record<PostmortemStatus, "default" | "warning" | "success"> = {
  DRAFT: "default",
  IN_REVIEW: "warning",
  PUBLISHED: "success",
};

// Phase 26 "Enterprise Incident Postmortems & Retrospectives" - eigene
// Uebersichtsseite ueber ALLE Postmortems (bereichsuebergreifend), waehrend
// das eigentliche Erstellen/Bearbeiten auf der Incident-Detailseite passiert
// (1:1-Beziehung zum Incident, siehe dort). Bewusst keine eigene RBAC/
// Organisationsfilterung - Postmortems folgen derselben "gemeinsame
// Ops-Konsole"-Sichtbarkeit wie /incidents (siehe Architekturentscheidung im
// Abschlussbericht).
export function Postmortems() {
  const [statusFilter, setStatusFilter] = useState<PostmortemStatus | "ALL">("ALL");
  const navigate = useNavigate();
  const postmortemsQuery = usePostmortems(statusFilter === "ALL" ? {} : { status: statusFilter });

  return (
    <PageContainer title="Postmortems">
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={statusFilter}
            onChange={(_event, value: PostmortemStatus | "ALL" | null) => {
              if (value) setStatusFilter(value);
            }}
          >
            <ToggleButton value="ALL">All statuses</ToggleButton>
            {POSTMORTEM_STATUSES.map((s) => (
              <ToggleButton key={s} value={s}>
                {STATUS_LABELS[s]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {postmortemsQuery.isLoading ? (
            <LoadingState label="Loading postmortems..." minHeight={300} />
          ) : postmortemsQuery.isError ? (
            <ErrorState message={getErrorMessage(postmortemsQuery.error)} onRetry={() => postmortemsQuery.refetch()} />
          ) : (postmortemsQuery.data ?? []).length === 0 ? (
            <EmptyState message="No postmortems match the current filter." minHeight={300} />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Incident</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Action items</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(postmortemsQuery.data ?? []).map((postmortem) => (
                  <TableRow
                    key={postmortem.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/incidents/${postmortem.incidentId}`)}
                  >
                    <TableCell>#{postmortem.incidentId}</TableCell>
                    <TableCell>
                      <Chip size="small" label={STATUS_LABELS[postmortem.status]} color={STATUS_COLOR[postmortem.status]} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {postmortem.actionItems.filter((item) => item.status === "DONE").length} / {postmortem.actionItems.length} done
                    </TableCell>
                    <TableCell>{formatDateTime(postmortem.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
