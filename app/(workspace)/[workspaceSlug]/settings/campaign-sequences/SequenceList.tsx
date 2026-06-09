import type { CampaignSequenceRow, CampaignTypeRow } from '@/modules/campaign-sequence/types'

interface Props {
  sequences:     CampaignSequenceRow[]
  types:         CampaignTypeRow[]
  workspaceSlug: string
}

export function SequenceList({ sequences, types }: Props) {
  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]))

  if (sequences.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No campaign sequences yet. Create your first sequence below.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b">
            <th className="text-left pb-2 pr-4">Name</th>
            <th className="text-left pb-2 pr-4">Campaign Type</th>
            <th className="text-left pb-2 pr-4">Status</th>
            <th className="text-left pb-2 pr-4">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sequences.map(seq => (
            <tr key={seq.id} className="hover:bg-muted/30">
              <td className="py-2 pr-4 font-medium">{seq.name}</td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">
                {typeMap[seq.campaign_type_id] ?? seq.campaign_type_id}
              </td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">{seq.status}</td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">
                {new Date(seq.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
