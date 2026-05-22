// ============================================================
// Phase 3B — Learning Agent Signal Calculation
// Pure functions only — no I/O, no async, no side effects.
// All inputs must be pre-loaded by the caller (service layer).
// ============================================================

import {
  LA_SIGNAL_NAMES,
  LA_DIMENSIONS,
  LA_CONFIDENCE,
} from './learning-agent.types'
import type {
  LaSignalName,
  LaDimension,
  LaConfidence,
  LearningSignal,
  Phase3bEventRecord,
  VersionDimensionContext,
} from './learning-agent.types'
import { classifyConfidence, calculateRate, getThresholds } from './learning-agent.confidence'

// ---- ET event type string constants used for filtering ----

const ET_SEND_INITIATED    = 'ET_SEND_INITIATED'
const ET_SEND_SUCCEEDED    = 'ET_SEND_SUCCEEDED'
const ET_SEND_FAILED       = 'ET_SEND_FAILED'
const ET_EMAIL_DELIVERED   = 'ET_EMAIL_DELIVERED'
const ET_EMAIL_BOUNCED     = 'ET_EMAIL_BOUNCED'
const ET_EMAIL_COMPLAINED  = 'ET_EMAIL_COMPLAINED'
const ET_EMAIL_DELIVERY_FAILED = 'ET_EMAIL_DELIVERY_FAILED'
const ET_EMAIL_OPENED      = 'ET_EMAIL_OPENED'
const ET_EMAIL_CLICKED     = 'ET_EMAIL_CLICKED'

// ---- buildVersionEventMap ----
// Builds Map<versionId, Set<eventType>> with deduplication applied.
// Each versionId maps to the SET of distinct event types seen for it.
// Multiple ET_EMAIL_OPENED events for the same version count as one.

export function buildVersionEventMap(
  events: Phase3bEventRecord[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const ev of events) {
    if (!ev.entityId) continue
    let set = map.get(ev.entityId)
    if (!set) {
      set = new Set<string>()
      map.set(ev.entityId, set)
    }
    set.add(ev.eventType)
  }
  return map
}

// ---- buildSignal ----
// Calculates a single LearningSignal from a denominator set and a numerator predicate.

function buildSignal(params: {
  signalName:      LaSignalName
  dimension:       LaDimension
  dimensionValue:  string
  denominatorIds:  Set<string>
  numeratorIds:    Set<string>
}): LearningSignal | null {
  const denominator = params.denominatorIds.size
  if (denominator === 0) return null   // no data for this group — omit entirely

  const numerator = [...params.denominatorIds].filter(id => params.numeratorIds.has(id)).length
  const thresholds = getThresholds(params.signalName)
  const confidence = classifyConfidence(denominator, thresholds)
  const rate = confidence === LA_CONFIDENCE.INSUFFICIENT
    ? null
    : calculateRate(numerator, denominator)

  let notes: string | null = null
  if (confidence === LA_CONFIDENCE.INSUFFICIENT) {
    notes = `Insufficient data (N < ${thresholds.insufficient}). Results will improve with more sends.`
  }

  return {
    signalName:     params.signalName,
    dimension:      params.dimension,
    dimensionValue: params.dimensionValue,
    numerator,
    denominator,
    rate,
    sampleN:        denominator,
    confidence,
    advisory:       true,
    notes,
  }
}

// ---- buildOpenClickSignal ----
// Special handling for open_rate and click_rate:
// When denominator >= threshold but numerator = 0, rate = 0.0 (not null) with a note.

function buildOpenClickSignal(params: {
  signalName:      LaSignalName
  dimension:       LaDimension
  dimensionValue:  string
  denominatorIds:  Set<string>   // delivered versions
  numeratorIds:    Set<string>   // opened/clicked versions
  zeroNote:        string
}): LearningSignal | null {
  const denominator = params.denominatorIds.size
  if (denominator === 0) return null

  const numerator = [...params.denominatorIds].filter(id => params.numeratorIds.has(id)).length
  const thresholds = getThresholds(params.signalName)
  const confidence = classifyConfidence(denominator, thresholds)

  let rate: number | null
  let notes: string | null = null

  if (confidence === LA_CONFIDENCE.INSUFFICIENT) {
    rate = null
    notes = `Insufficient data (N < ${thresholds.insufficient}). Results will improve with more sends.`
  } else if (numerator === 0) {
    // Delivered count >= threshold but zero open/click events
    rate = 0.0
    notes = params.zeroNote
  } else {
    rate = calculateRate(numerator, denominator)
  }

  return {
    signalName:     params.signalName,
    dimension:      params.dimension,
    dimensionValue: params.dimensionValue,
    numerator,
    denominator,
    rate,
    sampleN:        denominator,
    confidence,
    advisory:       true,
    notes,
  }
}

// ---- filterVersionIds ----
// Filters a set of versionIds to those matching a dimension predicate.

function filterVersionIds(
  allIds:              Iterable<string>,
  dimensionContextMap: Map<string, VersionDimensionContext>,
  predicate:           (ctx: VersionDimensionContext) => boolean
): Set<string> {
  const result = new Set<string>()
  for (const id of allIds) {
    const ctx = dimensionContextMap.get(id)
    if (ctx && predicate(ctx)) result.add(id)
  }
  return result
}

// ---- getVersionIdsWithEvent ----
// Returns a Set of versionIds that have the given event type.

function getVersionIdsWithEvent(
  versionEventMap: Map<string, Set<string>>,
  eventType:       string
): Set<string> {
  const result = new Set<string>()
  for (const [versionId, events] of versionEventMap) {
    if (events.has(eventType)) result.add(versionId)
  }
  return result
}

// ---- calculateSignalsForDimension ----
// Calculates all 10 signals for a given dimension filter.

function calculateSignalsForDimension(params: {
  dimension:        LaDimension
  dimensionValue:   string
  versionEventMap:  Map<string, Set<string>>
  versionIds:       Set<string>  // pre-filtered to this dimension
  approvedIds:      Set<string>  // from HRB_ACTION_APPROVED (all versions, not dimension-filtered)
  approvedInDim:    Set<string>  // approvedIds ∩ versionIds
}): LearningSignal[] {
  const { dimension, dimensionValue, versionEventMap, versionIds, approvedIds, approvedInDim } = params
  const signals: LearningSignal[] = []

  // --- Version ID sets by event type (within this dimension) ---
  const withInitiated       = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_SEND_INITIATED))
  const withSucceeded       = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_SEND_SUCCEEDED))
  const withFailed          = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_SEND_FAILED))
  const withDelivered       = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_EMAIL_DELIVERED))
  const withBounced         = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_EMAIL_BOUNCED))
  const withComplained      = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_EMAIL_COMPLAINED))
  const withDeliveryFailed  = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_EMAIL_DELIVERY_FAILED))
  const withOpened          = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_EMAIL_OPENED))
  const withClicked         = intersect(versionIds, getVersionIdsWithEvent(versionEventMap, ET_EMAIL_CLICKED))

  // --- send_success_rate: denominator = initiated, numerator = succeeded ---
  push(signals, buildSignal({
    signalName:     LA_SIGNAL_NAMES.SEND_SUCCESS_RATE,
    dimension, dimensionValue,
    denominatorIds: withInitiated,
    numeratorIds:   withSucceeded,
  }))

  // --- send_failure_rate: denominator = initiated, numerator = failed ---
  push(signals, buildSignal({
    signalName:     LA_SIGNAL_NAMES.SEND_FAILURE_RATE,
    dimension, dimensionValue,
    denominatorIds: withInitiated,
    numeratorIds:   withFailed,
  }))

  // --- delivery_rate: denominator = succeeded, numerator = delivered ---
  push(signals, buildSignal({
    signalName:     LA_SIGNAL_NAMES.DELIVERY_RATE,
    dimension, dimensionValue,
    denominatorIds: withSucceeded,
    numeratorIds:   withDelivered,
  }))

  // --- bounce_rate: denominator = succeeded, numerator = bounced ---
  push(signals, buildSignal({
    signalName:     LA_SIGNAL_NAMES.BOUNCE_RATE,
    dimension, dimensionValue,
    denominatorIds: withSucceeded,
    numeratorIds:   withBounced,
  }))

  // --- complaint_rate: denominator = succeeded, numerator = complained ---
  push(signals, buildSignal({
    signalName:     LA_SIGNAL_NAMES.COMPLAINT_RATE,
    dimension, dimensionValue,
    denominatorIds: withSucceeded,
    numeratorIds:   withComplained,
  }))

  // --- delivery_failure_rate: denominator = succeeded, numerator = delivery_failed ---
  push(signals, buildSignal({
    signalName:     LA_SIGNAL_NAMES.DELIVERY_FAILURE_RATE,
    dimension, dimensionValue,
    denominatorIds: withSucceeded,
    numeratorIds:   withDeliveryFailed,
  }))

  // --- open_rate: denominator = delivered, numerator = opened ---
  push(signals, buildOpenClickSignal({
    signalName:     LA_SIGNAL_NAMES.OPEN_RATE,
    dimension, dimensionValue,
    denominatorIds: withDelivered,
    numeratorIds:   withOpened,
    zeroNote:       'Zero open events recorded. Open tracking may not be enabled in Resend.',
  }))

  // --- click_rate: denominator = delivered, numerator = clicked ---
  push(signals, buildOpenClickSignal({
    signalName:     LA_SIGNAL_NAMES.CLICK_RATE,
    dimension, dimensionValue,
    denominatorIds: withDelivered,
    numeratorIds:   withClicked,
    zeroNote:       'Zero click events recorded. Click tracking may not be enabled in Resend.',
  }))

  // --- unknown_outcome_rate: succeeded with no follow-on webhook ---
  const withKnownOutcome = union(withDelivered, withBounced, withComplained, withDeliveryFailed)
  const withUnknown = new Set<string>([...withSucceeded].filter(id => !withKnownOutcome.has(id)))
  push(signals, buildSignal({
    signalName:     LA_SIGNAL_NAMES.UNKNOWN_OUTCOME_RATE,
    dimension, dimensionValue,
    denominatorIds: withSucceeded,
    numeratorIds:   withUnknown,
  }))

  // --- approval_to_send_rate: denominator = approved (in dim), numerator = approved ∩ initiated ---
  if (approvedInDim.size > 0) {
    const approvedAndSent = intersect(approvedInDim, getVersionIdsWithEvent(versionEventMap, ET_SEND_INITIATED))
    const sentDenominator = approvedInDim
    const unsentCount = approvedInDim.size - approvedAndSent.size
    const baseSignal = buildSignal({
      signalName:     LA_SIGNAL_NAMES.APPROVAL_TO_SEND_RATE,
      dimension, dimensionValue,
      denominatorIds: sentDenominator,
      numeratorIds:   approvedAndSent,
    })
    if (baseSignal) {
      const notesAddendum = unsentCount > 0
        ? `${unsentCount} approved version${unsentCount === 1 ? '' : 's'} not sent within the lookback window.`
        : null
      push(signals, { ...baseSignal, notes: notesAddendum })
    }
  }

  return signals
}

// ---- calculateAllSignals ----
// Top-level pure function: iterate all dimensions and calculate all signals.

export function calculateAllSignals(params: {
  events:              Phase3bEventRecord[]
  dimensionContextMap: Map<string, VersionDimensionContext>
  approvedVersionIds:  Set<string>  // from HRB_ACTION_APPROVED events
}): LearningSignal[] {
  const { events, dimensionContextMap, approvedVersionIds } = params

  if (events.length === 0) return []

  const versionEventMap = buildVersionEventMap(events)

  // All version IDs that appear in the ET_ event set
  const allVersionIds = new Set(versionEventMap.keys())

  const signals: LearningSignal[] = []

  // ---- TENANT_WIDE ----
  // approvedInDim uses the full approvedVersionIds set (not intersected with allVersionIds)
  // because approved-but-not-sent versions have no ET_ events and would otherwise be lost.
  signals.push(...calculateSignalsForDimension({
    dimension:       LA_DIMENSIONS.TENANT_WIDE,
    dimensionValue:  'all',
    versionEventMap,
    versionIds:      allVersionIds,
    approvedIds:     approvedVersionIds,
    approvedInDim:   approvedVersionIds,
  }))

  // ---- MESSAGE_TYPE ----
  const messageTypes = new Set<string>()
  for (const [, ctx] of dimensionContextMap) {
    if (ctx.messageType) messageTypes.add(ctx.messageType)
  }
  for (const msgType of messageTypes) {
    const typeIds = filterVersionIds(allVersionIds, dimensionContextMap, ctx => ctx.messageType === msgType)
    if (typeIds.size === 0) continue
    const approvedInDim = intersect(approvedVersionIds, typeIds)
    signals.push(...calculateSignalsForDimension({
      dimension:       LA_DIMENSIONS.MESSAGE_TYPE,
      dimensionValue:  msgType,
      versionEventMap,
      versionIds:      typeIds,
      approvedIds:     approvedVersionIds,
      approvedInDim,
    }))
  }

  // ---- STRATEGY_ANGLE ----
  const strategyAngles = new Set<string>()
  for (const [, ctx] of dimensionContextMap) {
    if (ctx.strategyAngle) strategyAngles.add(ctx.strategyAngle)
  }
  for (const angle of strategyAngles) {
    const angleIds = filterVersionIds(allVersionIds, dimensionContextMap, ctx => ctx.strategyAngle === angle)
    if (angleIds.size === 0) continue
    const approvedInDim = intersect(approvedVersionIds, angleIds)
    signals.push(...calculateSignalsForDimension({
      dimension:       LA_DIMENSIONS.STRATEGY_ANGLE,
      dimensionValue:  angle,
      versionEventMap,
      versionIds:      angleIds,
      approvedIds:     approvedVersionIds,
      approvedInDim,
    }))
  }

  // ---- SCORE_BAND ----
  const scoreBands = new Set<string>()
  for (const [, ctx] of dimensionContextMap) {
    if (ctx.scoreBand) scoreBands.add(ctx.scoreBand)
  }
  for (const band of scoreBands) {
    const bandIds = filterVersionIds(allVersionIds, dimensionContextMap, ctx => ctx.scoreBand === band)
    if (bandIds.size === 0) continue
    const approvedInDim = intersect(approvedVersionIds, bandIds)
    signals.push(...calculateSignalsForDimension({
      dimension:       LA_DIMENSIONS.SCORE_BAND,
      dimensionValue:  band,
      versionEventMap,
      versionIds:      bandIds,
      approvedIds:     approvedVersionIds,
      approvedInDim,
    }))
  }

  // ---- QRA_RECOMMENDED ----
  for (const isRec of [true, false]) {
    const recIds = filterVersionIds(
      allVersionIds,
      dimensionContextMap,
      ctx => ctx.isRecommended === isRec
    )
    if (recIds.size === 0) continue
    const approvedInDim = intersect(approvedVersionIds, recIds)
    signals.push(...calculateSignalsForDimension({
      dimension:       LA_DIMENSIONS.QRA_RECOMMENDED,
      dimensionValue:  isRec ? 'true' : 'false',
      versionEventMap,
      versionIds:      recIds,
      approvedIds:     approvedVersionIds,
      approvedInDim,
    }))
  }

  // ---- VERSION_LABEL ----
  // version_label comes from the ET_ event metadata (versionLabel field on Phase3bEventRecord)
  const versionLabels = new Set<string>()
  for (const ev of events) {
    if (ev.versionLabel) versionLabels.add(ev.versionLabel)
  }
  // Build a map from versionLabel → Set<versionId>
  const labelToVersionIds = new Map<string, Set<string>>()
  for (const ev of events) {
    if (!ev.versionLabel || !ev.entityId) continue
    let s = labelToVersionIds.get(ev.versionLabel)
    if (!s) { s = new Set(); labelToVersionIds.set(ev.versionLabel, s) }
    s.add(ev.entityId)
  }
  for (const [label, labelIds] of labelToVersionIds) {
    const approvedInDim = intersect(approvedVersionIds, labelIds)
    signals.push(...calculateSignalsForDimension({
      dimension:       LA_DIMENSIONS.VERSION_LABEL,
      dimensionValue:  label,
      versionEventMap,
      versionIds:      labelIds,
      approvedIds:     approvedVersionIds,
      approvedInDim,
    }))
  }

  return signals
}

// ---- Set helpers ----

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>()
  for (const x of a) if (b.has(x)) result.add(x)
  return result
}

function union<T>(...sets: Set<T>[]): Set<T> {
  const result = new Set<T>()
  for (const s of sets) for (const x of s) result.add(x)
  return result
}

function push(arr: LearningSignal[], signal: LearningSignal | null): void {
  if (signal !== null) arr.push(signal)
}
