// Presentation config for the hosted proposal + PDF certificate: the 321 Swipe
// contact block and "About us" intro. Pure, env-driven with safe 321 Swipe
// defaults (mirrors the CAN_SPAM_PHYSICAL_ADDRESS env pattern) so both surfaces
// render fully without any configuration. Read at call time, never cached.

export interface ProposalPresentation {
  senderName:     string
  senderTitle:    string
  senderEmail:    string
  companyWebsite: string
  companyPhone:   string
  aboutUs:        string
}

const DEFAULT_SENDER_NAME  = '321 Swipe Team'
const DEFAULT_SENDER_TITLE = 'Merchant Services'
const DEFAULT_EMAIL        = 'sales@321swipe.com'
const DEFAULT_WEBSITE      = '321swipe.com'
const DEFAULT_PHONE        = '941-552-0725'
const DEFAULT_ABOUT_US =
  '321 Swipe helps small and mid-sized businesses lower their payment processing ' +
  'costs through transparent interchange-plus pricing. We review your actual ' +
  'statement, show our work, and pass interchange through at cost so every dollar ' +
  'of savings stays with you.'

export function getProposalPresentation(): ProposalPresentation {
  return {
    senderName:     process.env.PROPOSAL_SENDER_NAME  ?? DEFAULT_SENDER_NAME,
    senderTitle:    process.env.PROPOSAL_SENDER_TITLE ?? DEFAULT_SENDER_TITLE,
    senderEmail:
      process.env.PROPOSAL_SENDER_EMAIL ??
      process.env.PROPOSAL_INQUIRY_EMAIL ??
      DEFAULT_EMAIL,
    companyWebsite: process.env.PROPOSAL_COMPANY_WEBSITE ?? DEFAULT_WEBSITE,
    companyPhone:   process.env.PROPOSAL_COMPANY_PHONE   ?? DEFAULT_PHONE,
    aboutUs:        process.env.PROPOSAL_ABOUT_US        ?? DEFAULT_ABOUT_US,
  }
}
