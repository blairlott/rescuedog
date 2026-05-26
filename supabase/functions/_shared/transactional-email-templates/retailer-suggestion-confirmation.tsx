/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, card, labelRed } from './_styles.ts'

interface Props { contactName?: string; storeName?: string }

const RetailerSuggestionConfirmation = ({ contactName, storeName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Thanks for suggesting a retailer</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{contactName ? `Thanks, ${contactName}.` : 'Thanks for the tip!'}</Heading>
        <Text style={text}>
          We received your suggestion{storeName ? ` for ${storeName}` : ''} and our wholesale team will reach out to introduce Rescue Dog Wines.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>What happens next</Text>
          <Text style={small}>1. Our regional rep reviews the store and confirms licensing.</Text>
          <Text style={small}>2. We reach out to the buyer with samples and pricing.</Text>
          <Text style={small}>3. Once stocked, we'll add the store to our public locator.</Text>
        </Section>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RetailerSuggestionConfirmation,
  subject: 'Thanks for suggesting a retailer',
  displayName: 'Retailer suggestion — submitter confirmation',
  previewData: { contactName: 'Alex', storeName: 'Main Street Wine & Spirits' },
} satisfies TemplateEntry