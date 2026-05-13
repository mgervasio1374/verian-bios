export interface RequestContext {
  tenantId: string
  workspaceId: string
  userId: string
  roleSlug: string
  permissions: string[]
  requestId: string
}

export interface SystemRequestContext extends RequestContext {
  userId: 'system'
  roleSlug: 'system'
  permissions: ['*']
}
