import { z } from 'zod'

export const INTAKE_SOURCES = [
  'website',
  'upload.321swipe.com',
  'app.321swipe.com',
  'tawk.to',
  'calendly',
] as const

export type IntakeSource = (typeof INTAKE_SOURCES)[number]

export const ContactIntakeSchema = z.object({
  source: z.enum(INTAKE_SOURCES),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  company_name: z.string().max(200).optional(),
  company_domain: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type ContactIntakePayload = z.infer<typeof ContactIntakeSchema>

export const FreeAnalysisIntakeSchema = z.object({
  source: z.enum(INTAKE_SOURCES).default('app.321swipe.com'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  company_name: z.string().max(200).optional(),
  company_domain: z.string().max(200).optional(),
  monthly_volume: z.number().int().nonnegative().optional(),
  processor: z.string().max(100).optional(),
  message: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type FreeAnalysisIntakePayload = z.infer<typeof FreeAnalysisIntakeSchema>

// Statement uploads arrive as multipart/form-data; non-file fields are parsed here.
// last_name is optional — the upload form collects it separately but older integrations
// may send a single combined name. The route handler normalises before calling upsertContact.
export const StatementIntakeMetaSchema = z.object({
  source: z.enum(INTAKE_SOURCES).default('upload.321swipe.com'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).default(''),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  company_name: z.string().max(200).optional(),
  company_domain: z.string().max(200).optional(),
  processor: z.string().max(100).optional(),
})
export type StatementIntakeMeta = z.infer<typeof StatementIntakeMetaSchema>
