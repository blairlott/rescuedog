/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  name?: string; email?: string; phone?: string;
  interests?: string[]; message?: string; hearAbout?: string; submissionId?: string;
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {value}</Text> : null

const ContactFormAdminNotification = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New contact form submission{p.name ? ` from ${p.name}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New contact form submission</Heading>
        <Section style={card}>
          <Text style={labelRed}>Contact</Text>
          <Row label="Name" value={p.name} />
          <Row label="Email" value={p.email} />
          <Row label="Phone" value={p.phone} />
          <Row label="Interests" value={p.interests?.length ? p.interests.join(', ') : undefined} />
          <Row label="Heard about us" value={p.hearAbout} />
        </Section>
        {p.message && (
          <Section style={card}>
            <Text style={labelRed}>Message</Text>
            <Text style={small}>{p.message}</Text>
          </Section>
        )}
        <Text style={footer}>
          Rescue Dog Wines · automated CRM notification{p.submissionId ? ` · ref ${p.submissionId.slice(0, 8)}` : ''}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactFormAdminNotification,
  subject: (d: Record<string, any>) => `New contact form submission${d?.name ? `: ${d.name}` : ''}`,
  displayName: 'Contact form — internal notification',
  previewData: { name: 'Jane Doe', email: 'jane@example.com', phone: '555-1234', interests: ['Questions'], message: 'Hi! Loved your wines.' },
} satisfies TemplateEntry