-- ============================================================
-- LOCAL DEV ONLY — Never use in staging or production.
-- ============================================================
-- Runs automatically after `supabase db reset`.
-- Creates a local dev auth user, email identity, and Platform Admin
-- membership so the app is immediately loginable after a reset.
--
-- Credentials are fictional and exist only in local Docker Postgres.
-- No real data. No real keys.
-- ============================================================

-- -------------------------------------------------------
-- LOCAL DEV USER
-- email:    dev@verian.local
-- password: localdev123
-- user_id:  99000000-0000-0000-0000-000000000001
-- -------------------------------------------------------
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  is_sso_user,
  is_anonymous,
  created_at,
  updated_at
) VALUES (
  '99000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'dev@verian.local',
  crypt('localdev123', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  false,
  false,
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------
-- EMAIL IDENTITY (required for email/password sign-in)
-- -------------------------------------------------------
INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  email,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '99000000-0000-0000-0000-000000000002',
  'dev@verian.local',
  '99000000-0000-0000-0000-000000000001',
  '{"sub": "99000000-0000-0000-0000-000000000001", "email": "dev@verian.local", "email_verified": true, "provider": "email"}',
  'email',
  'dev@verian.local',
  now(),
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------
-- MEMBERSHIP: Platform Admin, Verian Internal, Main Workspace
-- -------------------------------------------------------
INSERT INTO public.memberships (
  id,
  tenant_id,
  workspace_id,
  user_id,
  role_id,
  status,
  joined_at,
  created_at,
  updated_at
) VALUES (
  '98000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '99000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'active',
  now(),
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;
