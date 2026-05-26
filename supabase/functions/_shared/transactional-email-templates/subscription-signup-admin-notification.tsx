/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  firstName?: string; lastName?: string; email?: string; phone?: string;
  tier?: string; frequency?: string; subscriptionType?: string; discountPercent?: number;
  submissionId?: string;
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {value}</Text> : null

const SubscriptionSignupAdminNotification = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New curated box signup{p.firstName ? ` from ${p.firstName}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New curated box signup</Heading>
        <Section style={card}>
          <Text style={labelRed}>Customer</Text>
          <Row label="Name" value={[p.firstName, p.lastName].filter(Boolean).join(' ') || undefined} />
          <Row label="Email" value={p.email} />
          <Row label="Phone" value={p.phone} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Plan</Text>
          <Row label="Subscription type" value={p.subscriptionType} />
          <Row label="Tier" value={p.tier} />
          <Row label="Frequency" value={p.frequency} />
          <Row label="Discount %" value={p.discountPercent != null ? `${p.discountPercent}%` : undefined} />
        </Section>
        <Text style={footer}>
          Rescue Dog Wines · subscription request{p.submissionId ? ` · ref ${p.submissionId.slice(0, 8)}` : ''}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SubscriptionSignupAdminNotification,
  subject: (d: Record<string, any>) => `New curated box signup${d?.firstName ? `: ${d.firstName} ${d?.lastName ?? ''}`.trim() : ''}`,
  displayName: 'Curated box subscription — internal notification',
  previewData: { firstName: 'Taylor', lastName: 'Reed', email: 'taylor@example.com', tier: 'collector', frequency: 'monthly', discountPercent: 15 },
} satisfies TemplateEntry