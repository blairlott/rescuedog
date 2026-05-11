/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  firstName?: string
  orgName?: string
  eventName?: string
  eventDate?: string
  submittedAt?: string
}

const DonationCustomerConfirmation = ({ firstName, orgName, eventName, eventDate, submittedAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We received your donation request — thank you.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{firstName ? `Thank you, ${firstName}.` : 'Thank you for your request.'}</Heading>
        <Text style={text}>
          We've received your donation request{orgName ? ` on behalf of ${orgName}` : ''}. Our donation
          coordinator will review it and reply as soon as possible. We receive a high volume of
          requests, so it may take a little time — thank you for your patience.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>Your request</Text>
          {orgName && <Text style={small}><strong>Organization:</strong> {orgName}</Text>}
          {eventName && <Text style={small}><strong>Event:</strong> {eventName}</Text>}
          {eventDate && <Text style={small}><strong>Event date:</strong> {eventDate}</Text>}
          {submittedAt && <Text style={small}><strong>Submitted:</strong> {submittedAt}</Text>}
        </Section>
        <Text style={text}>If you have questions in the meantime, just reply to this email.</Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DonationCustomerConfirmation,
  subject: (d: Record<string, any>) => `Donation request received${d?.orgName ? ` — ${d.orgName}` : ''}`,
  displayName: 'Donation request — customer confirmation',
  previewData: { firstName: 'Jane', orgName: 'Happy Tails Rescue', eventName: 'Annual Gala', eventDate: 'Sep 12, 2026', submittedAt: 'May 11, 2026' },
} satisfies TemplateEntry