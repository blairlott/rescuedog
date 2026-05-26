/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, card, labelRed } from './_styles.ts'

interface Props { name?: string }

const ContactFormConfirmation = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We received your message — thanks!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Thanks, ${name}.` : 'Thanks for reaching out.'}</Heading>
        <Text style={text}>
          We received your message and a member of our team will get back to you as soon as possible —
          typically within 1–2 business days.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>What happens next</Text>
          <Text style={small}>1. Your message has been routed to the right person on our team.</Text>
          <Text style={small}>2. We'll reply directly to the email address you provided.</Text>
          <Text style={small}>3. For urgent shipping questions, you can also reach customerservice@vinoshipper.com.</Text>
        </Section>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactFormConfirmation,
  subject: 'We received your message',
  displayName: 'Contact form — customer confirmation',
  previewData: { name: 'Jane' },
} satisfies TemplateEntry