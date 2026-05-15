/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Rescue Dog Wines CRM'
const CRM_BASE_URL = `${(Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app')}/crm/account`

interface StaleRow {
  id: string
  account_name: string
  city?: string | null
  state?: string | null
  days_since_order: number
  staleness: '30' | '60' | '90'
}

interface Props {
  repName?: string
  accounts?: StaleRow[]
}

const badgeStyle = (s: '30' | '60' | '90') => ({
  backgroundColor: s === '90' ? '#fee2e2' : s === '60' ? '#ffedd5' : '#fef9c3',
  color: s === '90' ? '#991b1b' : s === '60' ? '#9a3412' : '#854d0e',
  padding: '2px 8px',
  fontSize: '12px',
  fontWeight: 600,
})

const StaleAccountsRepAlertEmail = ({ repName = 'team', accounts = [] }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{accounts.length} account(s) need attention</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>⏰ Stale Account Alert</Heading>
        <Text style={text}>Hi {repName},</Text>
        <Text style={text}>
          The following <strong>{accounts.length}</strong> account(s) assigned to you
          haven't placed an order in 30+ days:
        </Text>
        <Section>
          {accounts.map((a) => (
            <Section key={a.id} style={row}>
              <Link href={`${CRM_BASE_URL}/${a.id}`} style={accountLink}>{a.account_name}</Link>
              <Text style={meta}>
                {[a.city, a.state].filter(Boolean).join(', ') || '—'}
                {' · '}
                <span style={badgeStyle(a.staleness)}>{a.days_since_order} days</span>
              </Text>
            </Section>
          ))}
        </Section>
        <Text style={small}>Click an account to open it in the CRM.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StaleAccountsRepAlertEmail,
  subject: (data: Record<string, any>) =>
    `⏰ ${(data?.accounts?.length ?? 0)} Account(s) Need Attention`,
  displayName: 'Stale accounts — rep alert',
  previewData: {
    repName: 'Jane',
    accounts: [
      { id: '1', account_name: 'Sample Bottle Shop', city: 'Austin', state: 'TX', days_since_order: 45, staleness: '30' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#000', margin: '0 0 16px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.5', margin: '0 0 12px' }
const row = { borderBottom: '1px solid #eee', padding: '10px 0' }
const accountLink = { color: '#c30017', textDecoration: 'none', fontWeight: 700, fontSize: '15px' }
const meta = { fontSize: '12px', color: '#666', margin: '4px 0 0' }
const small = { fontSize: '12px', color: '#999', margin: '20px 0 0' }