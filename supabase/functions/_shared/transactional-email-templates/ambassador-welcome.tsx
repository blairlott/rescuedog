/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Rescue Dog Wines'
const IMPACT_SIGNUP_URL = 'https://app.impact.com/campaign-promo-signup/Rescue-Dog-Wines.brand'
const DASHBOARD_URL = 'https://rescuedogwines.com/ambassador/dashboard'

interface Props {
  name?: string
  handle?: string
  impactSignupUrl?: string
  dashboardUrl?: string
}

const AmbassadorWelcomeEmail = ({
  name,
  handle,
  impactSignupUrl = IMPACT_SIGNUP_URL,
  dashboardUrl = DASHBOARD_URL,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to the {SITE_NAME} Rescue Ambassadors program — one step left.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Welcome, ${name}.` : 'Welcome to the pack.'}</Heading>
        <Text style={text}>
          Your Rescue Ambassador application is in. To finish setup and unlock your
          public page{handle ? ` at /a/${handle}` : ''}, complete one final step:
          create your free affiliate account in our impact.com portal.
        </Text>

        <Section style={stepBox}>
          <Text style={stepLabel}>STEP 1</Text>
          <Text style={stepTitle}>Join the impact.com program</Text>
          <Text style={stepBody}>
            impact.com handles all commission tracking and tax paperwork (1099s) so
            you can focus on the wine and the rescues. Takes about 3 minutes.
          </Text>
          <Button href={impactSignupUrl} style={button}>Join the program</Button>
        </Section>

        <Section style={stepBox}>
          <Text style={stepLabel}>STEP 2</Text>
          <Text style={stepTitle}>Paste your tracking link</Text>
          <Text style={stepBody}>
            Once approved, copy your unique tracking URL from impact.com and paste
            it into your ambassador dashboard. We'll auto-verify the link, then
            publish your public page.
          </Text>
          <Button href={dashboardUrl} style={buttonOutline}>Open dashboard</Button>
        </Section>

        <Hr style={hr} />

        <Text style={small}>
          Questions? Just reply to this email. Thanks for helping us pour for a purpose.
        </Text>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AmbassadorWelcomeEmail,
  subject: 'One step left to activate your Rescue Ambassador page',
  displayName: 'Ambassador welcome',
  previewData: { name: 'Jane', handle: 'jane' },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '26px',
  fontWeight: 700,
  color: '#000000',
  margin: '0 0 18px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 24px' }
const stepBox = {
  border: '1px solid #e5e5e5',
  padding: '20px',
  margin: '0 0 16px',
}
const stepLabel = {
  fontSize: '11px',
  color: '#c30017',
  fontWeight: 700,
  letterSpacing: '1px',
  margin: '0 0 6px',
}
const stepTitle = { fontSize: '17px', fontWeight: 700, color: '#000', margin: '0 0 8px' }
const stepBody = { fontSize: '14px', color: '#555', lineHeight: '1.5', margin: '0 0 16px' }
const button = {
  backgroundColor: '#c30017',
  color: '#ffffff',
  padding: '12px 22px',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  display: 'inline-block',
}
const buttonOutline = {
  ...button,
  backgroundColor: '#ffffff',
  color: '#000000',
  border: '1px solid #000000',
}
const hr = { borderColor: '#e5e5e5', margin: '28px 0 18px' }
const small = { fontSize: '13px', color: '#666', lineHeight: '1.5', margin: '0 0 8px' }
const footer = { fontSize: '12px', color: '#999', margin: '20px 0 0' }