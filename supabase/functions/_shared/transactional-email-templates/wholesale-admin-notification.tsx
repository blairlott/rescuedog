/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  businessName?: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  state?: string; city?: string; licenseType?: string; message?: string; region?: string;
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {value}</Text> : null

const WholesaleAdminNotification = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New wholesale inquiry{p.businessName ? ` from ${p.businessName}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New wholesale inquiry</Heading>
        <Section style={card}>
          <Text style={labelRed}>Business</Text>
          <Row label="Name" value={p.businessName} />
          <Row label="License" value={p.licenseType} />
          <Row label="Location" value={[p.city, p.state].filter(Boolean).join(', ')} />
          <Row label="Region" value={p.region} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Contact</Text>
          <Row label="Name" value={p.contactName} />
          <Row label="Email" value={p.contactEmail} />
          <Row label="Phone" value={p.contactPhone} />
        </Section>
        {p.message && (
          <Section style={card}>
            <Text style={labelRed}>Message</Text>
            <Text style={small}>{p.message}</Text>
          </Section>
        )}
        <Text style={footer}>Rescue Dog Wines · automated CRM notification</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WholesaleAdminNotification,
  subject: (d: Record<string, any>) => `New wholesale inquiry${d?.businessName ? `: ${d.businessName}` : ''}`,
  displayName: 'Wholesale inquiry — internal notification',
  previewData: { businessName: 'Hill Country Wine Co.', contactName: 'Jane Doe', contactEmail: 'jane@example.com', state: 'TX', region: 'south' },
} satisfies TemplateEntry
