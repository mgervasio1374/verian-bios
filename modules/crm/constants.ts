// Shared CRM option lists — single source for dialogs and list filters.

export const INDUSTRY_OPTIONS = [
  '', 'Restaurant', 'Retail', 'Home Services', 'Healthcare', 'Automotive',
  'Beauty & Salon', 'Hospitality', 'Professional Services', 'E-commerce', 'Other',
]

export const COMPANY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'churned',  label: 'Churned' },
]
