import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { inngestFunctions } from '@/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
})
