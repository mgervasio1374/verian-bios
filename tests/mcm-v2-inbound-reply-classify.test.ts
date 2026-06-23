// mcm-v2 — Inbound reply classification (P3.5). Pure helpers. TC-IRC-01..02

import { describe, it, expect } from 'vitest'
import { isAutoReply, detectOptOut } from '@/modules/messaging/inbound/inbound-reply-classify'

describe('TC-IRC-01: isAutoReply', () => {
  it('true on Auto-Submitted: auto-replied', () => {
    expect(isAutoReply({ auto_submitted: 'auto-replied' }, 'Re: hi')).toBe(true)
  })
  it('true on Auto-Submitted: auto-generated', () => {
    expect(isAutoReply({ auto_submitted: 'auto-generated' }, null)).toBe(true)
  })
  it('true on X-Autoreply truthy', () => {
    expect(isAutoReply({ x_autoreply: 'yes' }, null)).toBe(true)
  })
  it('false on X-Autoreply "no"', () => {
    expect(isAutoReply({ x_autoreply: 'no' }, 'Re: thanks')).toBe(false)
  })
  it('true on Precedence: bulk', () => {
    expect(isAutoReply({ precedence: 'bulk' }, null)).toBe(true)
  })
  it('true on Precedence: auto_reply / junk', () => {
    expect(isAutoReply({ precedence: 'auto_reply' }, null)).toBe(true)
    expect(isAutoReply({ precedence: 'junk' }, null)).toBe(true)
  })
  it('true on subject "Out of Office: …"', () => {
    expect(isAutoReply({}, 'Out of Office: back Monday')).toBe(true)
  })
  it('true on subject "Automatic reply" / "vacation"', () => {
    expect(isAutoReply({}, 'Automatic reply')).toBe(true)
    expect(isAutoReply({}, 'On vacation until next week')).toBe(true)
  })
  it('false for a normal reply (no headers, ordinary subject)', () => {
    expect(isAutoReply({}, 'Re: your proposal')).toBe(false)
    expect(isAutoReply(null, 'Re: your proposal')).toBe(false)
  })
})

describe('TC-IRC-02: detectOptOut', () => {
  it('strict on "please unsubscribe me"', () => {
    expect(detectOptOut('please unsubscribe me')).toEqual({ detected: true, strict: true })
  })
  it('strict on "remove me from your list"', () => {
    expect(detectOptOut('remove me from your list')).toEqual({ detected: true, strict: true })
  })
  it('strict on opt-out / opt out / do not contact / stop emailing', () => {
    expect(detectOptOut('I want to opt out').strict).toBe(true)
    expect(detectOptOut('opt-out now').strict).toBe(true)
    expect(detectOptOut('do not contact me again').strict).toBe(true)
    expect(detectOptOut('please stop emailing').strict).toBe(true)
  })
  it('NOT strict on "let\'s talk, stop sending so many"', () => {
    const r = detectOptOut("let's talk, stop sending so many")
    expect(r.strict).toBe(false)
  })
  it('NOT strict on a bare "stop"', () => {
    expect(detectOptOut('stop')).toEqual({ detected: false, strict: false })
  })
  it('soft signal (not interested) → detected but not strict', () => {
    expect(detectOptOut('not interested, thanks')).toEqual({ detected: true, strict: false })
  })
  it('empty/null → neither', () => {
    expect(detectOptOut(null)).toEqual({ detected: false, strict: false })
    expect(detectOptOut('')).toEqual({ detected: false, strict: false })
  })
})
