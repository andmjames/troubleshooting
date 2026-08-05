// Shared permission model + URL-slug helpers.

// Areas a Standard user can be granted access to. Troubleshooting and Log a
// solution are always available. Settings is intentionally NOT here — it is an
// admin-only capability, not a grantable permission.
export const PERMISSIONS = [
  { key: 'preventative_maintenance', label: 'Preventative maintenance' },
  { key: 'edit_machines', label: 'Edit machines' },
  { key: 'analytics', label: 'Analytics' },
];

// Effective access: admins have everything; Settings is admin-only; everyone
// else uses their per-area grants.
export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (key === 'settings') return false;   // admin-only, never granted to Standard users
  return !!(user.permissions && user.permissions[key]);
}

// URL slug for a user's personal interface, e.g. "Andrew James" -> "andrew-james".
export function slugify(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
