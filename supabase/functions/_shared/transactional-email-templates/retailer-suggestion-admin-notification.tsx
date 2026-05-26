/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  storeName?: string; streetAddress?: string; city?: string; state?: string; zip?: string;
  phone?: string; premiseType?: string; contactName?: string; submitterEmail?: string;
  notes?: string; submissionId?: string;
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {value}</Text> : null

const RetailerSuggestionAdminNotification = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New retailer suggestion{p.storeName ? ` — ${p.storeName}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New retailer suggestion</Heading>
        <Section style={card}>
          <Text style={labelRed}>Store</Text>
          <Row label="Store name" value={p.storeName} />
          <Row label="Street" value={p.streetAddress} />
          <Row label="City" value={p.city} />
          <Row label="State" value={p.state} />
          <Row label="ZIP" value={p.zip} />
          <Row label="Phone" value={p.phone} />
          <Row label="Type" value={p.premiseType === 'on' ? 'On-premise (restaurant/bar)' : p.premiseType === 'off' ? 'Off-premise (retail)' : p.premiseType} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Submitted by</Text>
          <Row label="Name" value={p.contactName} />
          <Row label="Email" value={p.submitterEmail} />
          <Row label="Notes" value={p.notes} />
        </Section>
        <Text style={footer}>
          Rescue Dog Wines · retailer suggestion{p.submissionId ? ` · ref ${p.submissionId.slice(0, 8)}` : ''}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RetailerSuggestionAdminNotification,
  subject: (d: Record<string, any>) => `New retailer suggestion${d?.storeName ? `: ${d.storeName}` : ''}`,
  displayName: 'Retailer suggestion — internal notification',
  previewData: { storeName: 'Main Street Wine', city: 'Austin', state: 'TX', contactName: 'Alex', submitterEmail: 'alex@example.com' },
} satisfies TemplateEntry