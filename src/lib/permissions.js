// Shared permission model + URL-slug helpers.

// Areas a user can be granted access to. Troubleshooting and Log a solution are
// always available; these are the gated extras.
export const PERMISSIONS = [
  { key: 'preventative_maintenance', label: 'Preventative maintenance' },
  { key: 'settings', label: 'Settings' },
  { key: 'edit_machines', label: 'Edit machines' },
  { key: 'analytics', label: 'Analytics' },
];

// Effective access: admins have everything; everyone else uses their grants.
export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
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
