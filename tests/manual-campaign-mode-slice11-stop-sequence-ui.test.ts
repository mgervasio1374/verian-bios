import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const CARD = 'app/(workspace)/[workspaceSlug]/leads/[id]/CampaignAssignmentCard.tsx'

describe('TC-MM11: operator Stop sequence button (Issue 006)', () => {
  const src = read(CARD)

  it('imports stopCampaignSequenceAction', () => {
    expect(src).toMatch(/import\s*\{[^}]*stopCampaignSequenceAction[^}]*\}\s*from\s*'@\/modules\/messaging\/actions\/campaign-assignment\.actions'/)
  })

  it('removes the retire footgun (no retire action or handler)', () => {
    expect(src).not.toContain('retireCampaignAssignmentAction')
    expect(src).not.toContain('handleRetire')
  })

  it('handleStop confirms then calls stopCampaignSequenceAction', () => {
    const i = src.indexOf('function handleStop')
    expect(i).toBeGreaterThan(-1)
    const block = src.slice(i, i + 700)
    expect(block).toContain('window.confirm')
    expect(block).toContain('stopCampaignSequenceAction(')
  })

  it('renders a "Stop sequence" button wired to handleStop', () => {
    expect(src).toContain('Stop sequence')
    expect(src).toContain('handleStop(a.id)')
  })

  it('leaves the proposed Approve/Reject path intact', () => {
    expect(src).toContain('handleApprove(a.id)')
    expect(src).toContain('handleReject(a.id)')
  })
})
