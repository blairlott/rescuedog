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
import { template as staleAccountsRepAlert } from './stale-accounts-rep-alert.tsx'
import { template as staleAccountsSummary } from './stale-accounts-summary.tsx'
import { template as dropshipPartnerPo } from './dropship-partner-po.tsx'
import { template as reviewerInvite } from './reviewer-invite.tsx'
import { template as welcome1Story } from './welcome-1-story.tsx'
import { template as welcome2Sampler } from './welcome-2-sampler.tsx'
import { template as welcome3Reviews } from './welcome-3-reviews.tsx'
import { template as welcome4Mission } from './welcome-4-mission.tsx'
import { template as welcome5Nudge } from './welcome-5-nudge.tsx'
import { template as wineClubStaffAction } from './wine-club-staff-action.tsx'
import { template as merchCheckoutReminder } from './merch-checkout-reminder.tsx'
import { template as kennelAccessInvite } from './kennel-access-invite.tsx'
import { template as giftRecipientIncoming } from './gift-recipient-incoming.tsx'
import { template as giftRecipientShipped } from './gift-recipient-shipped.tsx'
import { template as clubShipmentShipped } from './club-shipment-shipped.tsx'
import { template as clubGiftShipmentShipped } from './club-gift-shipment-shipped.tsx'
import { template as wineSubPaymentFailed } from './wine-subscription-payment-failed.tsx'
import { template as wineSubCardExpiring } from './wine-subscription-card-expiring.tsx'
import { template as autopilotAutoStopped } from './autopilot-auto-stopped.tsx'
import { template as accessRequestAdminNotification } from './access-request-admin-notification.tsx'
import { template as vsApiUpdate } from './vs-api-update.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'ambassador-welcome': ambassadorWelcome,
  'donation-customer-confirmation': donationCustomerConfirmation,
  'donation-admin-notification': donationAdminNotification,
  'wholesale-customer-confirmation': wholesaleCustomerConfirmation,
  'wholesale-admin-notification': wholesaleAdminNotification,
  'stale-accounts-rep-alert': staleAccountsRepAlert,
  'stale-accounts-summary': staleAccountsSummary,
  'dropship-partner-po': dropshipPartnerPo,
  'reviewer-invite': reviewerInvite,
  'welcome-1-story': welcome1Story,
  'welcome-2-sampler': welcome2Sampler,
  'welcome-3-reviews': welcome3Reviews,
  'welcome-4-mission': welcome4Mission,
  'welcome-5-nudge': welcome5Nudge,
  'wine-club-staff-action': wineClubStaffAction,
  'merch-checkout-reminder': merchCheckoutReminder,
  'kennel-access-invite': kennelAccessInvite,
  'gift-recipient-incoming': giftRecipientIncoming,
  'gift-recipient-shipped': giftRecipientShipped,
  'club-shipment-shipped': clubShipmentShipped,
  'club-gift-shipment-shipped': clubGiftShipmentShipped,
  'wine-subscription-payment-failed': wineSubPaymentFailed,
  'wine-subscription-card-expiring': wineSubCardExpiring,
  'autopilot-auto-stopped': autopilotAutoStopped,
  'access-request-admin-notification': accessRequestAdminNotification,
}