'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  workspaceSlug: string
  tenantName?: string
}

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface NavSection {
  label?: string
  items: NavItem[]
}

export function Sidebar({ workspaceSlug }: SidebarProps) {
  const pathname = usePathname()
  const base = `/${workspaceSlug}`

  const sections: NavSection[] = [
    {
      items: [
        { label: 'Dashboard',     href: `${base}/dashboard`,     icon: <LayoutDashboard className="h-4 w-4" /> },
        { label: 'Companies',     href: `${base}/companies`,     icon: <Building2 className="h-4 w-4" /> },
        { label: 'Contacts',      href: `${base}/contacts`,      icon: <Users className="h-4 w-4" /> },
        { label: 'Leads',         href: `${base}/leads`,         icon: <Zap className="h-4 w-4" /> },
        { label: 'Opportunities', href: `${base}/opportunities`, icon: <TrendingUp className="h-4 w-4" /> },
        { label: 'Activities',    href: `${base}/activities`,    icon: <Activity className="h-4 w-4" /> },
        { label: 'Operations',    href: `${base}/operations`,    icon: <CalendarDays className="h-4 w-4" /> },
      ],
    },
    {
      label: 'WORKFLOW',
      items: [
        { label: 'Submissions',     href: `${base}/submissions`,         icon: <ArrowDownToLine className="h-4 w-4" /> },
        { label: 'Inbox',           href: `${base}/inbox`,               icon: <CheckCircle2 className="h-4 w-4" /> },
        { label: 'Proposals',       href: `${base}/proposals`,           icon: <Gauge className="h-4 w-4" /> },
        { label: 'Proposal Inbox',  href: `${base}/proposal-inbox`,      icon: <FileText className="h-4 w-4" /> },
        { label: 'Proposal Events', href: `${base}/proposal-events`,     icon: <ClipboardList className="h-4 w-4" /> },
        { label: 'Follow-Ups',      href: `${base}/proposal-follow-ups`, icon: <ListChecks className="h-4 w-4" /> },
      ],
    },
    {
      label: 'OUTREACH',
      items: [
        { label: 'Message Workspace', href: `${base}/message-workspace`,        icon: <MessageSquare className="h-4 w-4" /> },
        { label: 'Artifacts',         href: `${base}/artifacts`,                icon: <FolderOpen className="h-4 w-4" /> },
        { label: 'Campaign Assets',    href: `${base}/settings/campaign-assets`,    icon: <BookOpen className="h-4 w-4" /> },
        { label: 'Campaign Sequences', href: `${base}/settings/campaign-sequences`, icon: <Layers className="h-4 w-4" /> },
        { label: 'Segments',           href: `${base}/settings/segments`,           icon: <Tags className="h-4 w-4" /> },
        { label: 'Voice Exemplars',    href: `${base}/settings/exemplars`,          icon: <Sparkles className="h-4 w-4" /> },
        { label: 'Email Signature',    href: `${base}/settings/email-signature`,    icon: <PenLine className="h-4 w-4" /> },
        { label: 'Campaign Queue',    href: `${base}/settings/campaign-queue`,     icon: <ListTodo className="h-4 w-4" /> },
      ],
    },
    {
      label: 'INTELLIGENCE',
      items: [
        { label: 'Agent Monitor',       href: `${base}/settings/agent-monitor`,       icon: <Bot className="h-4 w-4" /> },
        { label: 'System Intelligence', href: `${base}/settings/system-intelligence`, icon: <Brain className="h-4 w-4" /> },
        { label: 'AI Usage',            href: `${base}/settings/ai-usage`,            icon: <Cpu className="h-4 w-4" /> },
        { label: 'Analytics',           href: `${base}/settings/analytics`,           icon: <BarChart2 className="h-4 w-4" /> },
        { label: 'Deliverability',      href: `${base}/settings/deliverability`,      icon: <MailCheck className="h-4 w-4" /> },
      ],
    },
    {
      label: 'ADMIN',
      items: [
        { label: 'Account',         href: `${base}/settings/account`,         icon: <UserCircle className="h-4 w-4" /> },
        { label: 'User Management', href: `${base}/settings/user-management`, icon: <UserCog className="h-4 w-4" /> },
        { label: 'System Controls', href: `${base}/settings/system-controls`, icon: <ShieldAlert className="h-4 w-4" /> },
        { label: 'Imports',         href: `${base}/settings/imports`,         icon: <Upload className="h-4 w-4" /> },
        { label: 'Settings',        href: `${base}/settings`,                 icon: <Settings className="h-4 w-4" /> },
      ],
    },
  ]

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand — fixed h-14 to match TopNav so the bottom border lines up */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/verian-logo.svg" alt="Verian" className="h-9 w-auto" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-1' : ''}>
            {section.label && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                      />
                    )}
                    {item.icon}
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
