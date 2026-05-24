// Phase 3B.2 — Data Import Foundation: row validation (pure functions)

import type { NormalizedImportRow, ValidationError, ValidationSeverity } from './import.types'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string | null): ValidationError | null {
  if (email === null) return null
  if (!EMAIL_REGEX.test(email)) {
    return {
      field:    'email',
      code:     'INVALID_EMAIL_FORMAT',
      message:  `Email "${email}" is not a valid email address`,
      severity: 'error',
    }
  }
  return null
}

export function validatePhone(phone: string | null): ValidationError | null {
  if (phone === null) return null
  if (phone.length < 10) {
    return {
      field:    'phone',
      code:     'PHONE_TOO_SHORT',
      message:  `Phone number "${phone}" appears too short — please verify`,
      severity: 'warning',
    }
  }
  return null
}

export function validateRequiredFields(normalized: NormalizedImportRow): ValidationError[] {
  const errors: ValidationError[] = []
  if (!normalized.companyName) {
    errors.push({
      field:    'company_name',
      code:     'MISSING_REQUIRED_FIELD',
      message:  'Company name is required',
      severity: 'error',
    })
  }
  // Must have at least one contact method
  const hasContactMethod = normalized.email || normalized.phone || normalized.website
  if (!hasContactMethod) {
    errors.push({
      field:    'contact_method',
      code:     'MISSING_CONTACT_METHOD',
      message:  'At least one of email, phone, or website is required',
      severity: 'error',
    })
  }
  return errors
}

export function validateRow(normalized: NormalizedImportRow): {
  status: 'valid' | 'invalid'
  errors: ValidationError[]
} {
  const errors: ValidationError[] = []

  errors.push(...validateRequiredFields(normalized))

  const emailError = validateEmail(normalized.email)
  if (emailError) errors.push(emailError)

  const phoneError = validatePhone(normalized.phone)
  if (phoneError) errors.push(phoneError)

  const hasErrors = errors.some(e => e.severity === 'error')
  return {
    status: hasErrors ? 'invalid' : 'valid',
    errors,
  }
}
