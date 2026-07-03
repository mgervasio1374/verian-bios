'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/layout/BrandMark'
import {
  NAV_SECTIONS,
  findActivePath,
  findSectionForPath,
  type NavSection,
  type SectionKey,
} from '@/components/layout/sidebar-nav.config'

interface SidebarProps {
  workspaceSlug: string
  tenantName?: string
}

const SECTION_STORAGE_KEY = 'verian.nav.section'
const COLLAPSED_STORAGE_KEY = 'verian.nav.collapsed'

const SECTION_KEYS = NAV_SECTIONS.map((s) => s.key)

function isSectionKey(value: string | null): value is SectionKey {
  return value !== null && (SECTION_KEYS as string[]).includes(value)
}

export function Sidebar({ workspaceSlug }: SidebarProps) {
  const pathname = usePathname()
  const base = `/${workspaceSlug}`

  const pathSection = findSectionForPath(pathname, workspaceSlug)
  const activePath = findActivePath(pathname, workspaceSlug)

  // Deep links open the section owning the current route; localStorage only
  // fills in when the route doesn't pin one (dashboard has no panel).
  // Both reads happen after mount so SSR/hydration render a stable default.
  const [openSection, setOpenSection] = useState<SectionKey>(pathSection)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (pathSection === 'dashboard') {
      const stored = localStorage.getItem(SECTION_STORAGE_KEY)
      // Intentional setState-in-effect: localStorage is only readable after mount,
      // and lazy state init would cause an SSR/client hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isSectionKey(stored)) setOpenSection(stored)
    }
    if (localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1') setCollapsed(true)
    // Mount-only: restores remembered state without fighting later clicks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pinSection(key: SectionKey) {
    setOpenSection(key)
    localStorage.setItem(SECTION_STORAGE_KEY, key)
    if (collapsed) setCollapsedAndRemember(false)
  }

  function expandPanel() {
    // Dashboard has no panel, so expanding from it falls back to CRM.
    const hasPanel = NAV_SECTIONS.some((s) => s.key === openSection && s.groups.length > 0)
    pinSection(hasPanel ? openSection : pathSection !== 'dashboard' ? pathSection : 'crm')
    setCollapsedAndRemember(false)
  }

  function setCollapsedAndRemember(next: boolean) {
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
  }

  const panelSection = NAV_SECTIONS.find(
    (s) => s.key === openSection && s.groups.length > 0
  )
  const panelOpen = !collapsed && !!panelSection

  const topSections = NAV_SECTIONS.filter((s) => s.key !== 'admin')
  const adminSection = NAV_SECTIONS.find((s) => s.key === 'admin')!

  function railEntry(section: NavSection) {
    const isRouteSection = section.key === pathSection
    const isOpen = panelOpen && section.key === openSection
    const railClasses = cn(
      'relative flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors',
      isOpen || isRouteSection
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
    )
    const inner = (
      <>
        {isRouteSection && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
          />
        )}
        <section.icon className="h-4 w-4" />
        <span className="text-[9px] font-medium leading-none">{section.label}</span>
      </>
    )
    if (section.directPath) {
      return (
        <Link
          key={section.key}
          href={`${base}${section.directPath}`}
          title={section.label}
          className={railClasses}
        >
          {inner}
        </Link>
      )
    }
    return (
      <button
        key={section.key}
        type="button"
        title={section.label}
        onClick={() => pinSection(section.key)}
        className={railClasses}
      >
        {inner}
      </button>
    )
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-sidebar-border bg-sidebar',
        panelOpen ? 'w-60' : 'w-14'
      )}
    >
      {/* Brand — fixed h-14 to match TopNav so the bottom border lines up */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        {panelOpen ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src="/brand/verian-logo.svg" alt="Verian" className="h-9 w-auto" />
        ) : (
          <BrandMark size={28} className="-ml-1" />
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Icon rail */}
        <div className="flex w-14 shrink-0 flex-col border-r border-sidebar-border px-1 py-3">
          <div className="space-y-1">{topSections.map(railEntry)}</div>
          <div className="mt-auto space-y-1">
            {railEntry(adminSection)}
            {!panelOpen && (
              <button
                type="button"
                title="Expand navigation"
                onClick={expandPanel}
                className="flex w-full flex-col items-center rounded-md px-1 py-2 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Pinned section panel */}
        {panelOpen && panelSection && (
          <nav className="flex min-w-0 flex-1 flex-col overflow-y-auto px-2 py-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {panelSection.label}
              </p>
              <button
                type="button"
                title="Collapse navigation"
                onClick={() => setCollapsedAndRemember(true)}
                className="rounded p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
            </div>
            {panelSection.groups.map((group, gi) => (
              <div key={group.label ?? gi} className={gi > 0 ? 'mt-2' : ''}>
                {group.label && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = item.path === activePath
                    return (
                      <Link
                        key={item.path}
                        href={`${base}${item.path}`}
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
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        )}
      </div>
    </aside>
  )
}
