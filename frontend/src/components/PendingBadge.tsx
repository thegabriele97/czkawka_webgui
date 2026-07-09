interface PendingBadgeProps {
  count: number | undefined;
}

export function PendingBadge({ count }: PendingBadgeProps) {
  if (!count) return null;
  return <span className="badge">{count}</span>;
}
