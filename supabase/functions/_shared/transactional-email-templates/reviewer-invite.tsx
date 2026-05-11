/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Rescue Dog Wines'

interface Props {
  recipientName?: string
  loginEmail?: string
  tempPassword?: string
  loginUrl?: string
  siteUrl?: string
  fromBlair?: boolean
  ccCopy?: boolean
}

const ReviewerInviteEmail = ({
  recipientName,
  loginEmail,
  tempPassword,
  loginUrl = 'https://rescuedogwines.com/crm/login',
  siteUrl = 'https://rescuedogwines.com',
  fromBlair = true,
  ccCopy = false,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{ccCopy ? 'Copy: reviewer credentials sent' : `Your reviewer access to ${SITE_NAME}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {ccCopy ? 'Copy: reviewer access provisioned' : `Welcome${recipientName ? `, ${recipientName}` : ''}.`}
        </Heading>

        {fromBlair && !ccCopy && (
          <Text style={text}>
            This is at Blair Lott's direction so you and Claude can kick the tires on the
            full {SITE_NAME} build — wine site, /merch, CRM, CMS, ambassadors, and the
            wine club portal. Blair will confirm separately.
          </Text>
        )}

        {ccCopy && (
          <Text style={text}>
            Blair — you asked to be CC'd. The credentials below were just provisioned and
            sent to {loginEmail}. Reviewer has full admin access until you revoke it.
          </Text>
        )}

        <Section style={credBox}>
          <Text style={credLabel}>LOGIN EMAIL</Text>
          <Text style={credValue}>{loginEmail}</Text>
          <Text style={credLabel}>TEMPORARY PASSWORD</Text>
          <Text style={credValueMono}>{tempPassword}</Text>
          <Text style={credHint}>Reset on first login at the CRM portal.</Text>
        </Section>

        <Section style={{ margin: '0 0 20px' }}>
          <Button href={loginUrl} style={button}>Sign in to CRM</Button>
        </Section>

        <Text style={text}>
          <strong>What's wired up:</strong>
        </Text>
        <Text style={list}>
          • <strong>Public site:</strong> <a href={siteUrl} style={link}>{siteUrl}</a> (age-gated wine catalog, /merch, /affiliates, /donate, /wholesale, /club, /locator)<br />
          • <strong>CRM:</strong> <a href={`${siteUrl}/crm`} style={link}>{siteUrl}/crm</a> — accounts, route planner, maps, ambassadors command center, admin panel<br />
          • <strong>CMS:</strong> <a href={`${siteUrl}/cms`} style={link}>{siteUrl}/cms</a> — inline editing, content library, WordPress import<br />
          • <strong>Wine Club Manager:</strong> <a href={`${siteUrl}/club/admin`} style={link}>{siteUrl}/club/admin</a><br />
          • <strong>Dropship Dashboard:</strong> <a href={`${siteUrl}/dropship`} style={link}>{siteUrl}/dropship</a>
        </Text>

        <Hr style={hr} />

        <Text style={small}>
          <strong>For Claude API testing:</strong> use the same credentials to sign in
          programmatically via the Supabase auth endpoint, then exercise the public
          REST and edge function surface. Lindy can drive the UI directly via the URL
          above. Please flag any UX, copy, compliance, or data-flow issues you find.
        </Text>

        <Text style={footer}>— On behalf of Blair Lott, {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ReviewerInviteEmail,
  subject: (d: Record<string, any>) =>
    d?.ccCopy
      ? `[CC] Reviewer access provisioned for ${d?.loginEmail || 'reviewer'}`
      : `Your reviewer access to ${SITE_NAME} (Blair's direction)`,
  displayName: 'Reviewer invite',
  previewData: {
    recipientName: 'Lindy',
    loginEmail: 'default-blair.lott@lindymail.ai',
    tempPassword: 'TempPass-XYZ-123',
    fromBlair: true,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '580px' }
const h1 = { fontSize: '24px', fontWeight: 700, color: '#000', margin: '0 0 18px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 18px' }
const list = { fontSize: '14px', color: '#333', lineHeight: '1.8', margin: '0 0 20px' }
const link = { color: '#c30017', textDecoration: 'underline' }
const credBox = { border: '1px solid #e5e5e5', padding: '18px 20px', margin: '0 0 20px', backgroundColor: '#fafafa' }
const credLabel = { fontSize: '11px', color: '#c30017', fontWeight: 700, letterSpacing: '1px', margin: '0 0 4px' }
const credValue = { fontSize: '15px', color: '#000', fontWeight: 600, margin: '0 0 14px' }
const credValueMono = { fontSize: '15px', color: '#000', fontFamily: 'Menlo, Consolas, monospace', fontWeight: 600, margin: '0 0 10px' }
const credHint = { fontSize: '12px', color: '#777', margin: '0' }
const button = { backgroundColor: '#c30017', color: '#fff', padding: '12px 22px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'inline-block' }
const hr = { borderColor: '#e5e5e5', margin: '24px 0 18px' }
const small = { fontSize: '13px', color: '#555', lineHeight: '1.6', margin: '0 0 12px' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }