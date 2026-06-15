// Preventative-maintenance helpers shared by the PM screens.

export const INTERVALS = [
  { label: 'Daily', days: 1 },
  { label: 'Weekly', days: 7 },
  { label: 'Every 2 weeks', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Quarterly', days: 90 },
  { label: 'Every 6 months', days: 182 },
  { label: 'Annually', days: 365 },
];

export function intervalLabel(days) {
  const hit = INTERVALS.find((i) => i.days === days);
  if (hit) return hit.label;
  return `Every ${days} days`;
}

// Days from today until a task is next due. Negative = overdue.
export function daysUntilDue(task, today = new Date()) {
  const base = task.last_completed ? new Date(task.last_completed + 'T00:00:00') : new Date();
  const due = new Date(base);
  due.setDate(due.getDate() + (task.interval_days || 0));
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((d - t) / 86400000);
}

// Bucket: 'red' overdue, 'yellow' due within 30 days (incl. today), 'green' 30+ days out.
export function bucketOf(days) {
  if (days < 0) return 'red';
  if (days <= 30) return 'yellow';
  return 'green';
}

// Tally an array of tasks into { green, yellow, red }.
export function tally(tasks, today = new Date()) {
  const out = { green: 0, yellow: 0, red: 0 };
  for (const t of tasks) out[bucketOf(daysUntilDue(t, today))]++;
  return out;
}

// Human "next due" description.
export function dueText(days) {
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

// Local YYYY-MM-DD for date inputs (avoids UTC off-by-one).
export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
