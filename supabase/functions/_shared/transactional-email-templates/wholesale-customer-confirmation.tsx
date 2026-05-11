/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  contactName?: string
  businessName?: string
  state?: string
}

const WholesaleCustomerConfirmation = ({ contactName, businessName, state }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We received your wholesale inquiry — thanks!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{contactName ? `Thanks, ${contactName}.` : 'Thanks for reaching out.'}</Heading>
        <Text style={text}>
          We received your wholesale inquiry{businessName ? ` for ${businessName}` : ''}{state ? ` in ${state}` : ''}.
          The right rep on our team will follow up shortly.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>What happens next</Text>
          <Text style={small}>1. We route your request based on your region and license type.</Text>
          <Text style={small}>2. A wholesale rep contacts you within 1–2 business days.</Text>
          <Text style={small}>3. You'll get pricing, samples info, and onboarding details.</Text>
        </Section>
        <Text style={footer}>— The Rescue Dog Wines wholesale team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WholesaleCustomerConfirmation,
  subject: 'We received your wholesale inquiry',
  displayName: 'Wholesale inquiry — customer confirmation',
  previewData: { contactName: 'Jane', businessName: 'Hill Country Wine Co.', state: 'TX' },
} satisfies TemplateEntry