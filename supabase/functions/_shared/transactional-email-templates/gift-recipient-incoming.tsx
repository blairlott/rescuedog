/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, h2, text, small, footer, hr, card, labelRed } from './_styles.ts'

interface Props {
  recipientName?: string
  buyerName?: string
  giftMessage?: string
  bottleCount?: number
}

const GiftRecipientIncomingEmail = ({
  recipientName,
  buyerName,
  giftMessage,
  bottleCount,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {buyerName ? `${buyerName} sent you a gift from Rescue Dog Wines` : 'A gift from Rescue Dog Wines is on the way'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {recipientName ? `${recipientName}, a gift is on the way.` : 'A gift is on the way.'}
        </Heading>
        <Text style={text}>
          {buyerName ? <><strong>{buyerName}</strong> sent you wine from </> : 'Someone sent you wine from '}
          <strong>Rescue Dog Wines</strong> — small-lot California wine that helps dogs find their forever home.
        </Text>
        <Text style={text}>
          {bottleCount && bottleCount > 0
            ? `${bottleCount} bottle${bottleCount === 1 ? '' : 's'} `
            : 'Your wine '}
          ships in 1–3 business days. We'll send tracking and an ETA the moment it leaves our warehouse.
        </Text>
        {giftMessage && giftMessage.trim().length > 0 && (
          <Section style={card}>
            <Text style={labelRed}>A note from {buyerName ?? 'the sender'}</Text>
            <Text style={{ ...text, margin: 0, fontStyle: 'italic' }}>
              "{giftMessage}"
            </Text>
          </Section>
        )}
        <Heading style={h2}>What to expect at delivery</Heading>
        <Text style={small}>
          • An adult (21+) signature is required at delivery — please plan to be home, or
          arrange a friend or neighbor.
        </Text>
        <Text style={small}>
          • Our compliance partner Vinoshipper handles fulfillment and tracking.
        </Text>
        <Hr style={hr} />
        <Text style={small}>
          Questions? Reply to this email — a real person reads every reply.
        </Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: GiftRecipientIncomingEmail,
  subject: (d: Record<string, any>) =>
    d.buyerName
      ? `${d.buyerName} sent you a gift from Rescue Dog Wines`
      : 'A gift from Rescue Dog Wines is on the way',
  displayName: 'Gift — incoming (a la carte)',
  previewData: {
    recipientName: 'Sam',
    buyerName: 'Jordan',
    giftMessage: "Happy birthday — this one's for you and the pups.",
    bottleCount: 3,
  },
} satisfies TemplateEntry
