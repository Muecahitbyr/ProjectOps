import { useState } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import { exportData, type ExportColumn, type ExportFormat } from "../../utils/export";

interface ExportMenuProps<T> {
  data: T[];
  columns: ExportColumn<T>[];
  filename: string;
  title: string;
  disabled?: boolean;
}

const FORMATS: Array<{ format: ExportFormat; label: string; icon: React.ReactNode }> = [
  { format: "csv", label: "CSV", icon: <TableChartOutlinedIcon fontSize="small" /> },
  { format: "excel", label: "Excel (.xlsx)", icon: <DescriptionOutlinedIcon fontSize="small" /> },
  { format: "pdf", label: "PDF", icon: <PictureAsPdfOutlinedIcon fontSize="small" /> },
  { format: "json", label: "JSON", icon: <DataObjectOutlinedIcon fontSize="small" /> },
];

// Exportiert ausschliesslich bereits geladene, echte Daten (data-Prop kommt
// direkt aus einem React-Query-Ergebnis) - keine erneute, moeglicherweise
// abweichende Serverabfrage beim Export.
export function ExportMenu<T>({ data, columns, filename, title, disabled }: ExportMenuProps<T>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = (format: ExportFormat): void => {
    setAnchorEl(null);
    setIsExporting(true);
    void exportData(format, data, columns, filename, title).finally(() => setIsExporting(false));
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={isExporting ? <CircularProgress size={14} /> : <FileDownloadOutlinedIcon />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        disabled={disabled || data.length === 0 || isExporting}
      >
        Export
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {FORMATS.map((entry) => (
          <MenuItem key={entry.format} onClick={() => handleExport(entry.format)}>
            <ListItemIcon>{entry.icon}</ListItemIcon>
            <ListItemText>{entry.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
