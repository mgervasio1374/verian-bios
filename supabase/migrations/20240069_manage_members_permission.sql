-- User Management slice: permission gating for member CRUD.
-- Adds workspace.manage_members and grants it to the three admin system roles.
-- platform_admin bypasses permission checks in code (hasPermission), so the
-- practical grant targets are tenant_admin and workspace_admin — platform_admin
-- is included for catalog completeness/reporting.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING throughout).

INSERT INTO permissions (slug, description, module)
VALUES ('workspace.manage_members', 'Create workspace users, assign roles, remove members', 'platform')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.slug = 'workspace.manage_members'
  AND r.is_system = true
  AND r.slug IN ('platform_admin', 'tenant_admin', 'workspace_admin')
ON CONFLICT DO NOTHING;
