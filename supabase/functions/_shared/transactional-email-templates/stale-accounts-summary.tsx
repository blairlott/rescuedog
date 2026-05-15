/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Row, Column, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const CRM_BASE_URL = `${(Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app')}/crm/account`

interface SummaryRow {
  id: string
  account_name: string
  rep_name?: string | null
  state?: string | null
  days_since_order: number
  staleness: '30' | '60' | '90'
}

interface Props {
  accounts?: SummaryRow[]
  stale30?: number
  stale60?: number
  stale90?: number
  stateCount?: number
}

const badgeStyle = (s: '30' | '60' | '90') => ({
  backgroundColor: s === '90' ? '#fee2e2' : s === '60' ? '#ffedd5' : '#fef9c3',
  color: s === '90' ? '#991b1b' : s === '60' ? '#9a3412' : '#854d0e',
  padding: '2px 8px',
  fontSize: '11px',
  fontWeight: 600,
})

const StaleAccountsSummaryEmail = ({
  accounts = [],
  stale30 = 0,
  stale60 = 0,
  stale90 = 0,
  stateCount = 0,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{accounts.length} stale accounts across {stateCount} state(s)</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>📊 Stale Accounts Summary</Heading>
        <Text style={subtitle}>Daily Overview</Text>

        <Row style={{ margin: '20px 0' }}>
          <Column style={{ ...stat, backgroundColor: '#fee2e2' }}>
            <Text style={{ ...statNum, color: '#991b1b' }}>{stale90}</Text>
            <Text style={{ ...statLabel, color: '#991b1b' }}>90+ days</Text>
          </Column>
          <Column style={{ ...stat, backgroundColor: '#ffedd5' }}>
            <Text style={{ ...statNum, color: '#9a3412' }}>{stale60}</Text>
            <Text style={{ ...statLabel, color: '#9a3412' }}>60+ days</Text>
          </Column>
          <Column style={{ ...stat, backgroundColor: '#fef9c3' }}>
            <Text style={{ ...statNum, color: '#854d0e' }}>{stale30}</Text>
            <Text style={{ ...statLabel, color: '#854d0e' }}>30+ days</Text>
          </Column>
        </Row>

        <Section>
          {accounts.map((a) => (
            <Section key={a.id} style={row}>
              <Link href={`${CRM_BASE_URL}/${a.id}`} style={accountLink}>{a.account_name}</Link>
              <Text style={meta}>
                {a.rep_name || 'Unassigned'} · {a.state || '—'} ·{' '}
                <span style={badgeStyle(a.staleness)}>{a.days_since_order}d</span>
              </Text>
            </Section>
          ))}
        </Section>

        <Text style={small}>
          Total: {accounts.length} stale accounts across {stateCount} state(s)
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StaleAccountsSummaryEmail,
  subject: (data: Record<string, any>) =>
    `📊 Daily Stale Accounts Summary: ${data?.accounts?.length ?? 0} accounts need attention`,
  displayName: 'Stale accounts — admin summary',
  previewData: {
    accounts: [
      { id: '1', account_name: 'Sample Bottle Shop', rep_name: 'Jane', state: 'TX', days_since_order: 95, staleness: '90' },
    ],
    stale30: 4, stale60: 2, stale90: 1, stateCount: 3,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '640px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#000', margin: '0', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const subtitle = { fontSize: '13px', color: '#666', margin: '4px 0 0' }
const stat = { padding: '12px', textAlign: 'center' as const }
const statNum = { fontSize: '24px', fontWeight: 700, margin: '0' }
const statLabel = { fontSize: '11px', margin: '4px 0 0' }
const row = { borderBottom: '1px solid #eee', padding: '8px 0' }
const accountLink = { color: '#c30017', textDecoration: 'none', fontWeight: 700, fontSize: '14px' }
const meta = { fontSize: '12px', color: '#666', margin: '4px 0 0' }
const small = { fontSize: '12px', color: '#999', margin: '20px 0 0', textAlign: 'center' as const }