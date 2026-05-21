/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  userName?: string
  userEmail?: string
  currentRoles?: string
  requestedArea?: string
  requestedRole?: string
  message?: string
  reviewUrl?: string
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {value}</Text> : null

const AccessRequestAdminNotification = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Access request from ${p.userName || p.userEmail || 'a team member'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Backend access request</Heading>
        <Section style={card}>
          <Text style={labelRed}>Requester</Text>
          <Row label="Name" value={p.userName} />
          <Row label="Email" value={p.userEmail} />
          <Row label="Current roles" value={p.currentRoles || '(none / read-only viewer)'} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Requesting</Text>
          <Row label="Area" value={p.requestedArea} />
          <Row label="Elevated role" value={p.requestedRole || 'full access (to be assigned by admin)'} />
        </Section>
        {p.message && (
          <Section style={card}>
            <Text style={labelRed}>Reason</Text>
            <Text style={small}>{p.message}</Text>
          </Section>
        )}
        {p.reviewUrl && (
          <Section style={card}>
            <Text style={small}>
              Review and approve / deny in the admin portal:&nbsp;
              <Link href={p.reviewUrl} style={{ color: '#c30017' }}>{p.reviewUrl}</Link>
            </Text>
          </Section>
        )}
        <Text style={footer}>Rescue Dog Wines · automated admin notification</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccessRequestAdminNotification,
  subject: (d: Record<string, any>) =>
    `[Admin] Access request: ${d?.userName || d?.userEmail || 'team member'} → ${d?.requestedArea || 'backend'}`,
  displayName: 'Backend access request — internal notification',
  previewData: {
    userName: 'Jana Ritter',
    userEmail: 'j.ritter@rescuedogwines.com',
    currentRoles: 'viewer',
    requestedArea: 'CMS',
    requestedRole: 'cms_editor',
    message: 'Need to publish the new blog posts.',
    reviewUrl: 'https://rescuedog.lovable.app/admin',
  },
} satisfies TemplateEntry
