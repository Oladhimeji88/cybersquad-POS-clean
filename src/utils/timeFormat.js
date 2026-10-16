// utils/timeFormat.js
export function formatSeconds(seconds) {
  if (!seconds || seconds === 0) return "0s";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  }
  if (minutes > 0) {
    if (secs > 0) return `${minutes}m ${secs}s`;
    return `${minutes}m`;
  }
  return `${secs}s`;
}

export function formatDuration(seconds) {
  // For dropdown display
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export function calculateTimeRemaining(deadlineAt) {
  if (!deadlineAt) return null;

  const deadline = new Date(deadlineAt);
  const now = new Date();
  const diffMs = deadline - now;

  if (diffMs <= 0) return { isOverdue: true, display: "Overdue" };

  const diffSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);

  return {
    isOverdue: false,
    display: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
    totalSeconds: diffSeconds,
  };
}
