// Preventative-maintenance helpers shared by the PM screens.

export const INTERVALS = [
  { label: 'Every 90 Days', days: 90 },
  { label: 'Every 6 Months', days: 182 },
  { label: 'Every Year', days: 365 },
];

export function intervalLabel(days) {
  const hit = INTERVALS.find((i) => i.days === days);
  if (hit) return hit.label;
  return `Every ${days} days`;
}

// Display title for a task: its name if set, otherwise the interval label.
export function taskTitle(task) {
  const n = task?.name?.trim();
  return n || intervalLabel(task?.interval_days);
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

// "Last completed on MM/DD/YY (N days ago)", or a note if never completed.
export function lastCompletedText(task) {
  if (!task?.last_completed) return 'Not completed yet';
  const d = new Date(task.last_completed + 'T00:00:00');
  if (isNaN(d)) return 'Not completed yet';
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ago = Math.round((t0 - d0) / 86400000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const agoText = ago <= 0 ? 'today' : `${ago} day${ago === 1 ? '' : 's'} ago`;
  return `Last completed on ${mm}/${dd}/${yy} (${agoText})`;
}

// Local YYYY-MM-DD for date inputs (avoids UTC off-by-one).
export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Shareable deep link to complete a specific task.
export function taskUrl(id) {
  return `${window.location.origin}/?pmtask=${id}`;
}
