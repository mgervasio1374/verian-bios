-- ============================================================
-- MIGRATION 001: PLATFORM LAYER
-- tenants, workspaces, roles, permissions, memberships,
-- feature_entitlements, branding_profiles
-- ============================================================

-- Helper: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------
-- TENANTS
-- -------------------------------------------------------
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  industry_type text,
  status      text NOT NULL DEFAULT 'active',
  plan_id     text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- WORKSPACES
-- -------------------------------------------------------
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'active',
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- ROLES
-- -------------------------------------------------------
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- -------------------------------------------------------
-- PERMISSIONS
-- -------------------------------------------------------
CREATE TABLE permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  description text,
  module      text NOT NULL
);

-- -------------------------------------------------------
-- ROLE PERMISSIONS (M:M)
-- -------------------------------------------------------
CREATE TABLE role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- -------------------------------------------------------
-- MEMBERSHIPS
-- -------------------------------------------------------
CREATE TABLE memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id      uuid NOT NULL REFERENCES roles(id),
  status       text NOT NULL DEFAULT 'active',
  invited_by   uuid REFERENCES auth.users(id),
  invited_at   timestamptz,
  joined_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_tenant_id ON memberships(tenant_id);

-- -------------------------------------------------------
-- FEATURE ENTITLEMENTS
-- -------------------------------------------------------
CREATE TABLE feature_entitlements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_slug  text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  config        jsonb NOT NULL DEFAULT '{}',
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_slug)
);

-- -------------------------------------------------------
-- BRANDING PROFILES
-- -------------------------------------------------------
CREATE TABLE branding_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  logo_url         text,
  favicon_url      text,
  primary_color    text,
  secondary_color  text,
  accent_color     text,
  font_family      text,
  custom_css       text,
  app_name         text,
  support_email    text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER branding_profiles_updated_at BEFORE UPDATE ON branding_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- RLS HELPER FUNCTIONS
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.workspace_id() RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::uuid
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.role_slug() RETURNS text AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role_slug'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.is_platform_admin() RETURNS boolean AS $$
  SELECT auth.role_slug() = 'platform_admin'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.is_tenant_admin() RETURNS boolean AS $$
  SELECT auth.role_slug() IN ('platform_admin', 'tenant_admin')
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.active_workspace_ids() RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM memberships
  WHERE user_id = auth.uid() AND status = 'active'
$$ LANGUAGE sql STABLE SECURITY DEFINER;
