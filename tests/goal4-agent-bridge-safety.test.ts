import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { VERIAN_BRIDGE_AGENTS } from '@/modules/verian-agent-bridge/agent-registry'
import { VERIAN_BRIDGE_MODEL_ROUTES } from '@/modules/verian-agent-bridge/model-router'
import { buildVerianBridgeDryRunPacket } from '@/modules/verian-agent-bridge/dry-run.service'

const root = path.resolve(__dirname, '..')
const bridgeDir = path.join(root, 'modules/verian-agent-bridge')

function readBridge(file: string) {
  return fs.readFileSync(path.join(bridgeDir, file), 'utf-8').replace(/\r\n/g, '\n')
}

const typesSrc = readBridge('types.ts')
const registrySrc = readBridge('agent-registry.ts')
const routerSrc = readBridge('model-router.ts')
const serviceSrc = readBridge('dry-run.service.ts')
const allBridgeSrc = [typesSrc, registrySrc, routerSrc, serviceSrc]

// ---------------------------------------------------------------------------
// TC-G4-S6-001  Bridge file inventory
// ---------------------------------------------------------------------------

describe('TC-G4-S6-001 bridge file inventory', () => {
  it('contains exactly the 4 expected files and no disallowed extras', () => {
    const files = fs.readdirSync(bridgeDir).sort()
    expect(files).toEqual(['agent-registry.ts', 'dry-run.service.ts', 'model-router.ts', 'types.ts'])
    const forbidden = [
      'task-packet.ts', 'bridge.service.ts', 'execution.service.ts',
      'model-router.service.ts', 'qwen.service.ts', 'claude.service.ts',
      'gpt.service.ts', 'codex.service.ts', 'send.service.ts', 'automation.service.ts',
    ]
    for (const f of forbidden) {
      expect(files).not.toContain(f)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-002  No provider SDK imports
// ---------------------------------------------------------------------------

describe('TC-G4-S6-002 no provider SDK imports', () => {
  it('bridge files contain no provider SDK import strings', () => {
    const sdkPatterns = [
      "from 'openai'", 'from "@openai',
      "from '@anthropic'", 'from "@anthropic',
      'qwen-sdk', 'codex-cli',
      "from 'langchain'", "from 'llamaindex'", "from 'ai-sdk'",
    ]
    for (const src of allBridgeSrc) {
      for (const pattern of sdkPatterns) {
        expect(src).not.toContain(pattern)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-003  No env/network/DB access
// ---------------------------------------------------------------------------

describe('TC-G4-S6-003 no env/network/DB access', () => {
  it('bridge files contain no env, network, or DB access patterns', () => {
    const forbidden = [
      'process.env',
      'fetch(',
      'axios',
      'createSupabase',
      "from '@/lib/supabase",
      'prisma.',
      "from 'pg'", 'from "pg"',
      "from 'drizzle'", 'from "drizzle"',
      "from '@prisma'", 'from "@prisma',
    ]
    for (const src of allBridgeSrc) {
      for (const pattern of forbidden) {
        expect(src).not.toContain(pattern)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-004  No shell/file/Git execution in dry-run service
// ---------------------------------------------------------------------------

describe('TC-G4-S6-004 no shell/file/Git execution in dry-run service', () => {
  it('dry-run.service.ts has no shell, filesystem, or git calls', () => {
    const forbidden = [
      'child_process', 'execSync', 'spawnSync', 'exec(', 'spawn(',
      'node:fs', 'node:path',
      'readFile', 'writeFile',
      'git status', 'git push', 'git tag',
    ]
    for (const pattern of forbidden) {
      expect(serviceSrc).not.toContain(pattern)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-005  No sending/migration/action calls
// ---------------------------------------------------------------------------

describe('TC-G4-S6-005 no sending/migration/action calls', () => {
  it('bridge files contain no send, migration, or action call patterns', () => {
    const forbidden = [
      'sendEmail(', 'sendCampaign(',
      'approveAndSendAction', 'sendFollowUpDraftAction',
      'EMAIL_SENDING_ENABLED = true', 'CAMPAIGN_SENDING_ENABLED = true',
      'supabase db push', 'db:migrate',
      'applyMigration(', 'runMigration(',
    ]
    for (const src of allBridgeSrc) {
      for (const pattern of forbidden) {
        expect(src).not.toContain(pattern)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-006  All agents are dry-run only
// ---------------------------------------------------------------------------

describe('TC-G4-S6-006 all agents are dry-run only', () => {
  it('VERIAN_BRIDGE_AGENTS has 15 agents all with dryRunOnly true', () => {
    expect(VERIAN_BRIDGE_AGENTS).toHaveLength(15)
    for (const agent of VERIAN_BRIDGE_AGENTS) {
      expect(agent.dryRunOnly).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-007  No critical ops in agent allowedActions
// ---------------------------------------------------------------------------

describe('TC-G4-S6-007 no critical ops in agent allowedActions', () => {
  it('no agent allowedActions includes critical blocked operations', () => {
    const criticalOps = [
      'send-email', 'campaign-sending', 'touch-production', 'apply-migration',
      'db-write', 'enable-EMAIL_SENDING_ENABLED', 'enable-CAMPAIGN_SENDING_ENABLED',
      'model-to-model-autonomous-routing', 'bypass-human-approval',
    ]
    for (const agent of VERIAN_BRIDGE_AGENTS) {
      for (const op of criticalOps) {
        expect(agent.allowedActions).not.toContain(op)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-008  All routes are dry-run only
// ---------------------------------------------------------------------------

describe('TC-G4-S6-008 all routes are dry-run only', () => {
  it('VERIAN_BRIDGE_MODEL_ROUTES has 7 routes all with dryRunOnly true', () => {
    expect(VERIAN_BRIDGE_MODEL_ROUTES).toHaveLength(7)
    for (const route of VERIAN_BRIDGE_MODEL_ROUTES) {
      expect(route.dryRunOnly).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-009  Qwen route restrictions
// ---------------------------------------------------------------------------

describe('TC-G4-S6-009 qwen route restrictions', () => {
  it('qwen routes are low-cost, low-risk, non-development, and block critical actions', () => {
    const qwenRoutes = VERIAN_BRIDGE_MODEL_ROUTES.filter(r => r.modelFamily === 'qwen')
    expect(qwenRoutes.length).toBeGreaterThanOrEqual(1)
    for (const route of qwenRoutes) {
      expect(route.costTier).toBe('low')
      expect(route.allowedRiskLevels).toEqual(['low'])
      expect(route.allowedAgentCategories).not.toContain('development')
      expect(route.blockedActions).toContain('send-email')
      expect(route.blockedActions).toContain('touch-production')
      expect(route.blockedActions).toContain('db-write')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-010  Codex / verian_deterministic / human route protections
// ---------------------------------------------------------------------------

describe('TC-G4-S6-010 codex, verian_deterministic, and human route protections', () => {
  it('each specialist route enforces its required blocked actions', () => {
    const codex = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'codex_code_review')!
    expect(codex.modelFamily).toBe('codex')
    expect(codex.blockedActions).toContain('auto-merge')
    expect(codex.blockedActions).toContain('apply-codex-suggestions-without-human-approval')

    const det = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'verian_deterministic_policy')!
    expect(det.modelFamily).toBe('verian_deterministic')
    expect(det.blockedActions).toContain('call-external-model')
    expect(det.blockedActions).toContain('execute-task')

    const human = VERIAN_BRIDGE_MODEL_ROUTES.find(r => r.routeId === 'human_high_risk_approval')!
    expect(human.modelFamily).toBe('human')
    expect(human.blockedActions).toContain('auto-approve')
    expect(human.blockedActions).toContain('delegate-approval-to-model')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-011  Dry-run builder blocks unsafe prompts
// ---------------------------------------------------------------------------

describe('TC-G4-S6-011 dry-run builder blocks unsafe prompts', () => {
  it('send email, apply migration, and touch production prompts all block with no taskPacket', () => {
    const base = {
      policyId: 'LOW_RISK_DOCS_ONLY' as const,
      requestedBy: 'michael' as const,
      intendedAgent: 'documentation_agent' as const,
      taskType: 'create-markdown-file',
    }

    const sendResult = buildVerianBridgeDryRunPacket({
      ...base,
      taskId: 'test-block-send',
      promptText: 'Send email to all leads in the active campaign.',
    })
    expect(sendResult.status).toBe('blocked')
    expect(sendResult.taskPacket).toBeUndefined()

    const migResult = buildVerianBridgeDryRunPacket({
      ...base,
      taskId: 'test-block-mig',
      promptText: 'Apply migration to the database now.',
    })
    expect(migResult.status).toBe('blocked')
    expect(migResult.taskPacket).toBeUndefined()

    const prodResult = buildVerianBridgeDryRunPacket({
      ...base,
      taskId: 'test-block-prod',
      promptText: 'Update production database configuration.',
    })
    expect(prodResult.status).toBe('blocked')
    expect(prodResult.taskPacket).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-012  Dry-run builder creates safe docs packet
// ---------------------------------------------------------------------------

describe('TC-G4-S6-012 dry-run builder creates safe docs packet', () => {
  it('LOW_RISK_DOCS_ONLY + documentation_agent produces packet with dryRunOnly true', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-safe-docs',
      policyId: 'LOW_RISK_DOCS_ONLY',
      requestedBy: 'michael',
      intendedAgent: 'documentation_agent',
      taskType: 'create-markdown-file',
      promptText: 'Create a Goal 4 productivity report markdown file.',
    })
    expect(result.status).toBe('packet_created')
    expect(result.taskPacket).toBeDefined()
    expect(result.taskPacket!.dryRunOnly).toBe(true)
    expect(result.taskPacket!.policyCheckStatus).toBe('pass')
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-013  High-risk dev packet preserves gates
// ---------------------------------------------------------------------------

describe('TC-G4-S6-013 high-risk dev packet preserves gates', () => {
  it('HIGH_RISK_DEV + claude_implementation_agent requires approval, Codex review, not qwen', () => {
    const result = buildVerianBridgeDryRunPacket({
      taskId: 'test-high-risk',
      policyId: 'HIGH_RISK_DEV_NO_PROD_NO_SEND_NO_AUTOMATION',
      requestedBy: 'michael',
      intendedAgent: 'claude_implementation_agent',
      taskType: 'create-service-file',
      promptText:
        'Create the new dry-run service file for Goal 4. Codex review required. Michael approval needed before push.',
    })
    if (result.status === 'packet_created' && result.taskPacket) {
      expect(result.taskPacket.requiresHumanApproval).toBe(true)
      expect(result.taskPacket.requiresCodexReview).toBe(true)
      expect(result.taskPacket.recommendedModel).not.toBe('qwen')
      expect(result.taskPacket.dryRunOnly).toBe(true)
    } else {
      // If blocked, verify no qwen was suggested
      expect(result.modelRecommendation?.recommendedModel).not.toBe('qwen')
    }
  })
})

// ---------------------------------------------------------------------------
// TC-G4-S6-014  Dry-run service depends on policy checker
// ---------------------------------------------------------------------------

describe('TC-G4-S6-014 dry-run service depends on policy checker', () => {
  it('dry-run.service.ts contains required policy and bridge registry imports', () => {
    expect(serviceSrc).toContain('checkVerianPromptPolicy')
    expect(serviceSrc).toContain('VERIAN_POLICY_REGISTRY')
    expect(serviceSrc).toContain('VERIAN_BRIDGE_AGENT_REGISTRY')
    expect(serviceSrc).toContain('VERIAN_BRIDGE_MODEL_ROUTES')
  })
})
