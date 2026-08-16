import type { PendingAction } from "../../types/pal";

interface ActionCardProps {
  action: PendingAction;
}

const STATUS_LABEL: Record<PendingAction["status"], string> = {
  pending: "Waiting for approval",
  denied: "Denied",
  executing: "Running…",
  succeeded: "Done",
  failed: "Failed",
};

/**
 * Status display for a tool call the assistant made. Phase A only offers
 * auto-run (read-only) actions, so this renders the outcome after the fact —
 * approve/deny controls land in Phase B once confirm-required actions exist.
 */
export function ActionCard({ action }: ActionCardProps) {
  return (
    <div className={`pal-action-card pal-action-card-${action.status}`}>
      <div className="pal-action-card-header">
        <span className="pal-action-card-name">{action.name}</span>
        <span className="pal-action-card-status">{STATUS_LABEL[action.status]}</span>
      </div>
      {action.error && <p className="pal-action-card-error">{action.error}</p>}
    </div>
  );
}
