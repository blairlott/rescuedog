/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, h2, text, small, footer, hr, card, labelRed, button } from './_styles.ts'

interface Props {
  orgName?: string
  eventName?: string
  eventDate?: string
  numAttendees?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  isNonprofit?: string
  ein?: string
  irsLetterUrl?: string
  sponsorshipFileUrl?: string
  summary?: Record<string, string | undefined>
}

const Row = ({ label, value }: { label: string; value?: string }) => (
  value ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {value}</Text> : null
)

const DonationAdminNotification = ({ orgName, eventName, eventDate, numAttendees, contactName, contactEmail, contactPhone, isNonprofit, ein, irsLetterUrl, sponsorshipFileUrl, summary }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New donation request{orgName ? ` from ${orgName}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New donation request</Heading>
        <Section style={card}>
          <Text style={labelRed}>Organization</Text>
          <Row label="Org" value={orgName} />
          <Row label="Nonprofit" value={isNonprofit} />
          <Row label="EIN" value={ein} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Event</Text>
          <Row label="Name" value={eventName} />
          <Row label="Date" value={eventDate} />
          <Row label="Attendees" value={numAttendees} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Contact</Text>
          <Row label="Name" value={contactName} />
          <Row label="Email" value={contactEmail} />
          <Row label="Phone" value={contactPhone} />
        </Section>
        {(irsLetterUrl || sponsorshipFileUrl) && (
          <Section style={card}>
            <Text style={labelRed}>Documents</Text>
            {irsLetterUrl && <Text style={{ margin: '8px 0' }}><Button href={irsLetterUrl} style={button}>Download IRS letter</Button></Text>}
            {sponsorshipFileUrl && <Text style={{ margin: '8px 0' }}><Button href={sponsorshipFileUrl} style={button}>Download sponsorship doc</Button></Text>}
            <Text style={small}>Links expire in 7 days.</Text>
          </Section>
        )}
        {summary && Object.keys(summary).length > 0 && (
          <>
            <Hr style={hr} />
            <Heading as="h2" style={h2}>Full submission</Heading>
            {Object.entries(summary).map(([k, v]) => v ? <Row key={k} label={k} value={String(v)} /> : null)}
          </>
        )}
        <Text style={footer}>Rescue Dog Wines · automated CRM notification</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DonationAdminNotification,
  subject: (d: Record<string, any>) => `New donation request: ${d?.orgName || 'unknown org'}`,
  displayName: 'Donation request — internal notification',
  previewData: { orgName: 'Happy Tails Rescue', eventName: 'Annual Gala', contactName: 'Jane Doe', contactEmail: 'jane@example.org' },
} satisfies TemplateEntry