/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, card, labelRed } from './_styles.ts'

interface Props { businessName?: string; contactName?: string }

const MarketplaceApplicationConfirmation = ({ businessName, contactName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We received your Sell on Rescue Dog application</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {contactName ? `Thanks, ${contactName}.` : 'Thanks for applying.'}
        </Heading>
        <Text style={text}>
          We received your application{businessName ? ` for ${businessName}` : ''} to join the Rescue Dog Marketplace Partner Program.
          Our merchandising team reviews every submission personally.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>What happens next</Text>
          <Text style={small}>1. We review your brand, products, and fulfillment model (typically 5–10 business days).</Text>
          <Text style={small}>2. If it's a fit, we'll reach out to discuss onboarding, sample products, and payout terms.</Text>
          <Text style={small}>3. Approved partners go live on rescuedogwines.com/merch with monthly payouts.</Text>
        </Section>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MarketplaceApplicationConfirmation,
  subject: 'We received your Marketplace Partner application',
  displayName: 'Marketplace partner — applicant confirmation',
  previewData: { businessName: 'Wag Goods Co.', contactName: 'Sam' },
} satisfies TemplateEntry