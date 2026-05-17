/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Rescue Dog Wines'

interface Props {
  recipientName?: string
  recoveryUrl?: string
  rolesLabel?: string
  invitedByName?: string
}

const KennelAccessInviteEmail = ({
  recipientName,
  recoveryUrl,
  rolesLabel = 'View-only Kennel access',
  invitedByName = 'Blair Lott',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your access to The Kennel — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {recipientName ? `Welcome, ${recipientName}.` : 'Welcome.'}
        </Heading>
        <Text style={text}>
          {invitedByName} has granted you access to <strong>The Kennel</strong> — the
          {' '}{SITE_NAME} ad-ops and performance command center.
        </Text>
        <Section style={credBox}>
          <Text style={credLabel}>ACCESS LEVEL</Text>
          <Text style={credValue}>{rolesLabel}</Text>
        </Section>
        {recoveryUrl && (
          <Section style={{ margin: '0 0 20px' }}>
            <Button href={recoveryUrl} style={button}>Set your password</Button>
            <Text style={small}>Link expires in 1 hour. If it expires, use "Forgot password" on the login page.</Text>
          </Section>
        )}
        <Text style={text}>
          After signing in, open <strong>The Kennel</strong> from the admin nav to see
          campaign performance, channel health, and AI insights.
        </Text>
        <Text style={footer}>— {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: KennelAccessInviteEmail,
  subject: `Your access to The Kennel — ${SITE_NAME}`,
  displayName: 'Kennel access invite',
  previewData: {
    recipientName: 'Jane',
    recoveryUrl: 'https://example.com/reset-password?token=demo',
    rolesLabel: 'View-only Kennel access',
    invitedByName: 'Blair Lott',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '580px' }
const h1 = { fontSize: '24px', fontWeight: 700, color: '#000', margin: '0 0 18px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 18px' }
const credBox = { border: '1px solid #e5e5e5', padding: '18px 20px', margin: '0 0 20px', backgroundColor: '#fafafa' }
const credLabel = { fontSize: '11px', color: '#c30017', fontWeight: 700, letterSpacing: '1px', margin: '0 0 4px' }
const credValue = { fontSize: '15px', color: '#000', fontWeight: 600, margin: '0' }
const button = { backgroundColor: '#c30017', color: '#fff', padding: '12px 22px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'inline-block' }
const small = { fontSize: '12px', color: '#777', margin: '10px 0 0' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }