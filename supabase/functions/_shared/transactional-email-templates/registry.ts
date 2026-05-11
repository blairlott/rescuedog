/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as ambassadorWelcome } from './ambassador-welcome.tsx'
import { template as donationCustomerConfirmation } from './donation-customer-confirmation.tsx'
import { template as donationAdminNotification } from './donation-admin-notification.tsx'
import { template as wholesaleCustomerConfirmation } from './wholesale-customer-confirmation.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'ambassador-welcome': ambassadorWelcome,
  'donation-customer-confirmation': donationCustomerConfirmation,
  'donation-admin-notification': donationAdminNotification,
  'wholesale-customer-confirmation': wholesaleCustomerConfirmation,
}