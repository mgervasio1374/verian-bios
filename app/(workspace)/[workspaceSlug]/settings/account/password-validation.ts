// Pure validation for the self-service change-password flow (#27). Runs before
// any auth call so invalid input never hits the network.

export const MIN_PASSWORD_LENGTH = 8

export type PasswordValidation =
  | { ok: true }
  | { ok: false; error: string }

export function validatePasswordChange(newPassword: string, confirm: string): PasswordValidation {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (newPassword !== confirm) {
    return { ok: false, error: 'The two passwords do not match.' }
  }
  return { ok: true }
}
