import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildRequestContext } from '@/lib/auth/context'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings } from 'lucide-react'

interface PageProps {
  params: Promise<{ workspaceSlug: string }>
}

export default async function SettingsPage({ params }: PageProps) {
  await params
  const supabase = await createSupabaseServerClient()
  const ctx = await buildRequestContext(supabase)

  const service = createSupabaseServiceClient()
  const [{ data: entitlements }, { data: pipelineStages }, { data: prompts }] = await Promise.all([
    service.from('feature_entitlements').select('*').eq('tenant_id', ctx.tenantId),
    service.from('pipeline_stage_configs').select('*').eq('tenant_id', ctx.tenantId).order('position'),
    service.from('prompt_configs').select('*').or(`tenant_id.is.null,tenant_id.eq.${ctx.tenantId}`),
  ])

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Workspace and platform configuration</p>
      </div>

      {/* Feature Entitlements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Feature Entitlements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(entitlements ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="capitalize">{e.feature_slug.replace(/_/g, ' ')}</span>
                <Badge variant={e.enabled ? 'default' : 'secondary'}>
                  {e.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Stages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Lead Pipeline Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {(pipelineStages ?? []).filter(s => s.pipeline_type === 'lead').map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-none"
                  style={{ backgroundColor: s.color ?? '#6B7280' }}
                />
                <span>{s.name}</span>
                {s.is_terminal && (
                  <Badge variant="outline" className="text-xs ml-auto">Terminal</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prompt Configs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Prompt Configurations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(prompts ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.slug}</p>
                </div>
                <Badge variant={p.is_active ? 'default' : 'secondary'}>
                  {p.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-dashed p-4 text-center">
        <Settings className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Full config management UI coming in Phase 3.
        </p>
      </div>
    </div>
  )
}
