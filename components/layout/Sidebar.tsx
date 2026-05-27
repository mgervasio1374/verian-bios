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
  CheckCircle2,
  FolderOpen,
  Settings,
  ChevronLeft,
  ArrowDownToLine,
  Bot,
  ShieldAlert,
  MessageSquare,
  Upload,
  Brain,
  BarChart2,
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

export function Sidebar({ workspaceSlug, tenantName }: SidebarProps) {
  const pathname = usePathname()
  const base = `/${workspaceSlug}`

  const navItems: NavItem[] = [
    { label: 'Dashboard',   href: `${base}/dashboard`,   icon: <LayoutDashboard className="h-4 w-4" /> },
    { label: 'Companies',   href: `${base}/companies`,   icon: <Building2 className="h-4 w-4" /> },
    { label: 'Contacts',    href: `${base}/contacts`,    icon: <Users className="h-4 w-4" /> },
    { label: 'Leads',       href: `${base}/leads`,       icon: <Zap className="h-4 w-4" /> },
    { label: 'Opportunities', href: `${base}/opportunities`, icon: <TrendingUp className="h-4 w-4" /> },
    { label: 'Activities',  href: `${base}/activities`,  icon: <Activity className="h-4 w-4" /> },
    { label: 'Submissions',  href: `${base}/submissions`,  icon: <ArrowDownToLine className="h-4 w-4" /> },
    { label: 'Inbox',       href: `${base}/inbox`,       icon: <CheckCircle2 className="h-4 w-4" /> },
    { label: 'Msg Workspace', href: `${base}/message-workspace`, icon: <MessageSquare className="h-4 w-4" /> },
    { label: 'Artifacts',     href: `${base}/artifacts`,               icon: <FolderOpen className="h-4 w-4" /> },
    { label: 'Agent Monitor',        href: `${base}/settings/agent-monitor`,        icon: <Bot className="h-4 w-4" /> },
    { label: 'System Controls',     href: `${base}/settings/system-controls`,     icon: <ShieldAlert className="h-4 w-4" /> },
    { label: 'Sys Intelligence',    href: `${base}/settings/system-intelligence`, icon: <Brain className="h-4 w-4" /> },
    { label: 'Imports',             href: `${base}/settings/imports`,             icon: <Upload className="h-4 w-4" /> },
    { label: 'Analytics',           href: `${base}/settings/analytics`,           icon: <BarChart2 className="h-4 w-4" /> },
    { label: 'Settings',        href: `${base}/settings`,                  icon: <Settings className="h-4 w-4" /> },
  ]

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-background">
      {/* Logo / Brand */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
          V
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold">Verian BIOS</span>
          {tenantName && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{tenantName}</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
