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
  signInUrl?: string
}

const CmsEditorInviteEmail = ({
  recipientName,
  loginEmail,
  tempPassword,
  signInUrl = 'https://rescuedogwines.com/crm/login',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your CMS editor access to {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          Welcome{recipientName ? `, ${recipientName}` : ''}.
        </Heading>

        <Text style={text}>
          You've been granted <strong>CMS editor</strong> access to {SITE_NAME}.
          Use the temporary password below to sign in. You'll be required to
          choose a new password on your first login.
        </Text>

        <Section style={credBox}>
          <Text style={credLabel}>LOGIN EMAIL</Text>
          <Text style={credValue}>{loginEmail}</Text>
          <Text style={credLabel}>TEMPORARY PASSWORD</Text>
          <Text style={credValueMono}>{tempPassword}</Text>
          <Text style={credHint}>You will be prompted to change this on first sign-in.</Text>
        </Section>

        <Section style={{ margin: '0 0 20px' }}>
          <Button href={signInUrl} style={button}>Sign in to CMS</Button>
        </Section>

        <Hr style={hr} />

        <Text style={small}>
          The CMS lets you edit site content, heroes, blog posts, media, and
          marketing copy. If you weren't expecting this invitation, you can
          ignore this email.
        </Text>

        <Text style={footer}>— {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CmsEditorInviteEmail,
  subject: "You've been invited to the Rescue Dog Wines CMS",
  displayName: 'CMS editor invite',
  previewData: {
    recipientName: 'Sam',
    loginEmail: 'sam@example.com',
    tempPassword: 'TempPass-XYZ-123',
    signInUrl: 'https://rescuedogwines.com/crm/login',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '580px' }
const h1 = { fontSize: '24px', fontWeight: 700, color: '#000', margin: '0 0 18px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 18px' }
const credBox = { border: '1px solid #e5e5e5', padding: '18px 20px', margin: '0 0 20px', backgroundColor: '#fafafa' }
const credLabel = { fontSize: '11px', color: '#c30017', fontWeight: 700, letterSpacing: '1px', margin: '0 0 4px' }
const credValue = { fontSize: '15px', color: '#000', fontWeight: 600, margin: '0 0 14px' }
const credValueMono = { fontSize: '15px', color: '#000', fontFamily: 'Menlo, Consolas, monospace', fontWeight: 600, margin: '0 0 10px' }
const credHint = { fontSize: '12px', color: '#777', margin: '0' }
const button = { backgroundColor: '#c30017', color: '#fff', padding: '12px 22px', fontSize: '14px', fontWeight: 700, textDecoration: 'none', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'inline-block' }
const hr = { borderColor: '#e5e5e5', margin: '24px 0 18px' }
const small = { fontSize: '13px', color: '#555', lineHeight: '1.6', margin: '0 0 12px' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }