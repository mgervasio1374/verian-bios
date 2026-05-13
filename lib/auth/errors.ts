export class UnauthorizedError extends Error {
  readonly statusCode = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404
  constructor(resource = 'Resource') {
    super(`${resource} not found`)
    this.name = 'NotFoundError'
  }
}

export class RateLimitExceededError extends Error {
  readonly statusCode = 429
  constructor(
    public readonly policy: { scope: string; windowHours: number; maxSends: number; onExceeded: string }
  ) {
    super(`Email rate limit exceeded: max ${policy.maxSends} per ${policy.windowHours}h`)
    this.name = 'RateLimitExceededError'
  }
}
