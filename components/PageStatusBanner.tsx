import { Construction } from 'lucide-react'

// Calm, honest page-state strip for surfaces that are not fully functional
// yet. Deliberately muted — no warning colors, no emoji.

interface PageStatusBannerProps {
  variant?: 'planned' | 'in-development'
  purpose: string
}

const TITLES: Record<NonNullable<PageStatusBannerProps['variant']>, string> = {
  planned:          'Planned for a future release',
  'in-development': 'In active development',
}

export function PageStatusBanner({ variant = 'planned', purpose }: PageStatusBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <Construction className="h-4 w-4 mt-0.5 flex-none text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold">{TITLES[variant]}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{purpose}</p>
      </div>
    </div>
  )
}
