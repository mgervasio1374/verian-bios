import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { inngestFunctions } from '@/inngest'

// Every Inngest step executes inside THIS route's function invocation, so the
// platform default (10s) capped all background work — including the chunked
// import commit and the campaign send dispatcher. 60s is the Hobby maximum.
export const maxDuration = 60

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
})
