import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CampaignAssetPerformancePlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Performance data will appear after campaign sends (Phase 3N).
        </p>
      </CardContent>
    </Card>
  )
}
