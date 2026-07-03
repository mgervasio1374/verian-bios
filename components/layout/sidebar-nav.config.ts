// Pure nav data for the workspace sidebar — no React rendering, so the
// vitest node environment can assert on it directly. Paths are relative to
// the workspace base (`/${workspaceSlug}`); Sidebar prepends the base.

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Building2,
  Users,
  Zap,
  TrendingUp,
  Activity,
  CalendarDays,
  CheckCircle2,
  FileText,
  ArrowDownToLine,
  MessageSquare,
  FolderOpen,
  Settings,
  Upload,
  Bot,
  ShieldAlert,
  Brain,
  BarChart2,
  MailCheck,
  Cpu,
  BookOpen,
  ListTodo,
  ClipboardList,
  ListChecks,
  Gauge,
  UserCog,
  UserCircle,
  Layers,
  Tags,
  Sparkles,
  PenLine,
  Send,
} from 'lucide-react'

export type SectionKey =
  | 'dashboard'
  | 'crm'
  | 'workflow'
  | 'outreach'
  | 'intelligence'
  | 'admin'

export interface NavItem {
  label: string
  /** Path relative to the workspace base, e.g. '/settings/campaign-queue' */
  path: string
  icon: LucideIcon
}

export interface NavGroup {
  /** Sub-header shown inside the panel (only Outreach uses labeled groups) */
  label?: string
  items: NavItem[]
}

export interface NavSection {
  key: SectionKey
  label: string
  icon: LucideIcon
  /** When set, the rail entry is a direct link and the section has no panel */
  directPath?: string
  groups: NavGroup[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    directPath: '/dashboard',
    groups: [],
  },
  {
    key: 'crm',
    label: 'CRM',
    icon: Building2,
    groups: [
      {
        items: [
          { label: 'Companies',     path: '/companies',     icon: Building2 },
          { label: 'Contacts',      path: '/contacts',      icon: Users },
          { label: 'Leads',         path: '/leads',         icon: Zap },
          { label: 'Opportunities', path: '/opportunities', icon: TrendingUp },
          { label: 'Activities',    path: '/activities',    icon: Activity },
          { label: 'Operations',    path: '/operations',    icon: CalendarDays },
        ],
      },
    ],
  },
  {
    key: 'workflow',
    label: 'Workflow',
    icon: ClipboardList,
    groups: [
      {
        items: [
          { label: 'Submissions',     path: '/submissions',         icon: ArrowDownToLine },
          { label: 'Inbox',           path: '/inbox',               icon: CheckCircle2 },
          { label: 'Proposals',       path: '/proposals',           icon: Gauge },
          { label: 'Proposal Inbox',  path: '/proposal-inbox',      icon: FileText },
          { label: 'Proposal Events', path: '/proposal-events',     icon: ClipboardList },
          { label: 'Follow-Ups',      path: '/proposal-follow-ups', icon: ListChecks },
        ],
      },
    ],
  },
  {
    key: 'outreach',
    label: 'Outreach',
    icon: Send,
    groups: [
      {
        label: 'Authoring',
        items: [
          { label: 'Message Workspace',  path: '/message-workspace',           icon: MessageSquare },
          { label: 'Artifacts',          path: '/artifacts',                   icon: FolderOpen },
          { label: 'Campaign Assets',    path: '/settings/campaign-assets',    icon: BookOpen },
          { label: 'Campaign Sequences', path: '/settings/campaign-sequences', icon: Layers },
          { label: 'Campaign Types',     path: '/settings/campaign-types',     icon: Layers },
          { label: 'Voice Exemplars',    path: '/settings/exemplars',          icon: Sparkles },
          { label: 'Email Signature',    path: '/settings/email-signature',    icon: PenLine },
        ],
      },
      {
        label: 'Sending',
        items: [
          { label: 'Segments',       path: '/settings/segments',       icon: Tags },
          { label: 'Campaign Queue', path: '/settings/campaign-queue', icon: ListTodo },
        ],
      },
      {
        label: 'Responses',
        items: [
          { label: 'Replies', path: '/settings/replies', icon: MailCheck },
        ],
      },
    ],
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    icon: Brain,
    groups: [
      {
        items: [
          { label: 'Agent Lab',           path: '/settings/agent-monitor',       icon: Bot },
          { label: 'System Intelligence', path: '/settings/system-intelligence', icon: Brain },
          { label: 'AI Usage',            path: '/settings/ai-usage',            icon: Cpu },
          { label: 'Analytics',           path: '/settings/analytics',           icon: BarChart2 },
          { label: 'Deliverability',      path: '/settings/deliverability',      icon: MailCheck },
        ],
      },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: Settings,
    groups: [
      {
        items: [
          { label: 'Account',         path: '/settings/account',         icon: UserCircle },
          { label: 'User Management', path: '/settings/user-management', icon: UserCog },
          { label: 'System Controls', path: '/settings/system-controls', icon: ShieldAlert },
          { label: 'Imports',         path: '/settings/imports',         icon: Upload },
          { label: 'Settings',        path: '/settings',                 icon: Settings },
        ],
      },
    ],
  },
]

/** All relative paths a section owns, including a direct-link path. */
export function sectionPaths(section: NavSection): string[] {
  const paths = section.groups.flatMap((g) => g.items.map((i) => i.path))
  return section.directPath ? [section.directPath, ...paths] : paths
}

/** Every nav path in the config, flattened across sections. */
export function allNavPaths(): string[] {
  return NAV_SECTIONS.flatMap(sectionPaths)
}

interface PathMatch {
  key: SectionKey
  path: string
}

// Longest-match wins so '/settings' (Admin) never shadows the more specific
// '/settings/*' items owned by Outreach / Intelligence / Admin siblings.
function bestMatch(pathname: string, workspaceSlug: string): PathMatch | null {
  const base = `/${workspaceSlug}`
  let best: PathMatch | null = null
  for (const section of NAV_SECTIONS) {
    for (const path of sectionPaths(section)) {
      const href = `${base}${path}`
      if (pathname === href || pathname.startsWith(`${href}/`)) {
        if (!best || path.length > best.path.length) {
          best = { key: section.key, path }
        }
      }
    }
  }
  return best
}

/** Section key owning the current pathname; 'dashboard' when nothing matches. */
export function findSectionForPath(pathname: string, workspaceSlug: string): SectionKey {
  return bestMatch(pathname, workspaceSlug)?.key ?? 'dashboard'
}

/** Relative path of the nav item that should highlight for this pathname. */
export function findActivePath(pathname: string, workspaceSlug: string): string | null {
  return bestMatch(pathname, workspaceSlug)?.path ?? null
}
