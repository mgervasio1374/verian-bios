import { ChevronRight } from 'lucide-react'

// Server-safe progressive disclosure built on native <details>/<summary> —
// no client JS, works in server components.

interface CollapsibleSectionProps {
  title: string
  description?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({ title, description, defaultOpen, children }: CollapsibleSectionProps) {
  return (
    <details open={defaultOpen} className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer items-start gap-2 px-4 py-3 list-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-4 w-4 mt-0.5 flex-none text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {description && (
            <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
          )}
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}
