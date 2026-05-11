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
import { template as wholesaleAdminNotification } from './wholesale-admin-notification.tsx'
import { template as staleAccountRepAlert } from './stale-account-rep-alert.tsx'
import { template as staleAccountAdminSummary } from './stale-account-admin-summary.tsx'
import { template as dropshipPartnerPO } from './dropship-partner-po.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'ambassador-welcome': ambassadorWelcome,
  'donation-customer-confirmation': donationCustomerConfirmation,
  'donation-admin-notification': donationAdminNotification,
  'wholesale-customer-confirmation': wholesaleCustomerConfirmation,
  'wholesale-admin-notification': wholesaleAdminNotification,
  'stale-account-rep-alert': staleAccountRepAlert,
  'stale-account-admin-summary': staleAccountAdminSummary,
  'dropship-partner-po': dropshipPartnerPO,
}