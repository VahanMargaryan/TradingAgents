import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/api";

const VARIANT: Record<RunStatus, "default" | "success" | "destructive" | "warning" | "muted" | "secondary"> = {
  queued: "muted",
  running: "warning",
  completed: "success",
  failed: "destructive",
  cancelled: "secondary",
};

const LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
