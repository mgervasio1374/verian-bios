export interface IntakeTenant {
  tenantId: string
  workspaceId: string
}

export function resolveIntakeTenant(): IntakeTenant {
  const tenantId = process.env.INTAKE_TENANT_ID
  const workspaceId = process.env.INTAKE_WORKSPACE_ID

  if (!tenantId || !workspaceId) {
    throw new Error('INTAKE_TENANT_ID and INTAKE_WORKSPACE_ID must be configured')
  }

  return { tenantId, workspaceId }
}
