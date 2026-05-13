import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'verian-bios',
  eventKey: process.env.INNGEST_EVENT_KEY,
})
