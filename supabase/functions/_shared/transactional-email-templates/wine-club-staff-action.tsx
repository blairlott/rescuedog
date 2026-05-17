/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  action?: string
  customerEmail?: string
  customerName?: string
  userId?: string
  vinoshipperCustomerId?: string
  fromTier?: string
  toTier?: string
  pauseCycles?: number
  reason?: string
  vinoshipperSynced?: boolean
  vinoshipperError?: string
  submittedAt?: string
}

const Row = ({ label, value }: { label: string; value?: string | number | boolean }) =>
  value !== undefined && value !== null && value !== ''
    ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {String(value)}</Text>
    : null

const WineClubStaffAction = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Wine Club {p.action || 'change'} — {p.customerEmail || 'member'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Wine Club action: {p.action}</Heading>
        <Section style={card}>
          <Text style={labelRed}>Member</Text>
          <Row label="Name" value={p.customerName} />
          <Row label="Email" value={p.customerEmail} />
          <Row label="User ID" value={p.userId} />
          <Row label="Vinoshipper Customer ID" value={p.vinoshipperCustomerId} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Change</Text>
          <Row label="Action" value={p.action} />
          <Row label="From tier" value={p.fromTier} />
          <Row label="To tier" value={p.toTier} />
          <Row label="Pause cycles" value={p.pauseCycles} />
          <Row label="Reason" value={p.reason} />
          <Row label="Submitted at" value={p.submittedAt} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Vinoshipper sync</Text>
          <Row label="Synced" value={p.vinoshipperSynced ? 'Yes' : 'No'} />
          <Row label="Error" value={p.vinoshipperError} />
          {!p.vinoshipperSynced && (
            <Text style={small}>
              ACTION REQUIRED: Please apply this change manually in Vinoshipper.
            </Text>
          )}
        </Section>
        <Text style={footer}>Rescue Dog Wines · automated wine club notification</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WineClubStaffAction,
  subject: (d: Record<string, any>) =>
    `Wine Club ${d?.action || 'change'} — ${d?.customerEmail || 'member'}${d?.vinoshipperSynced ? '' : ' (manual action required)'}`,
  displayName: 'Wine Club — staff action notification',
  previewData: {
    action: 'cancel',
    customerEmail: 'jane@example.com',
    customerName: 'Jane Doe',
    userId: 'abc-123',
    fromTier: 'rescue',
    reason: 'Moving',
    vinoshipperSynced: false,
    vinoshipperError: 'VINOSHIPPER_API_KEY not configured',
    submittedAt: '2026-05-17 10:00',
  },
} satisfies TemplateEntry