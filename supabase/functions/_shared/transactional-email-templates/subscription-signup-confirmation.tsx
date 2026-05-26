/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, card, labelRed } from './_styles.ts'

interface Props { firstName?: string; tier?: string; frequency?: string }

const tierLabel = (t?: string) => t === 'enthusiast' ? 'Enthusiast' : t === 'collector' ? 'Collector' : t === 'connoisseur' ? 'Connoisseur' : t || 'curated box'
const freqLabel = (f?: string) => f === 'monthly' ? 'monthly' : f === 'quarterly' ? 'quarterly' : f === 'bimonthly' ? 'every other month' : f || ''

const SubscriptionSignupConfirmation = ({ firstName, tier, frequency }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to the Rescue Dog Wines curated box</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{firstName ? `Welcome, ${firstName}.` : 'Welcome to The Pack.'}</Heading>
        <Text style={text}>
          We received your request for our <strong>{tierLabel(tier)}</strong> curated box
          {frequency ? `, shipping ${freqLabel(frequency)}` : ''}. A team member will reach out within 1–2 business days to confirm
          shipping details and process your first order.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>What happens next</Text>
          <Text style={small}>1. We confirm your shipping address and verify your state allows direct-to-consumer wine delivery.</Text>
          <Text style={small}>2. We curate your first box based on your tier and send a preview before charging.</Text>
          <Text style={small}>3. You can pause, swap, or cancel anytime — no contracts.</Text>
        </Section>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SubscriptionSignupConfirmation,
  subject: 'We received your curated box request',
  displayName: 'Curated box subscription — customer confirmation',
  previewData: { firstName: 'Taylor', tier: 'collector', frequency: 'monthly' },
} satisfies TemplateEntry