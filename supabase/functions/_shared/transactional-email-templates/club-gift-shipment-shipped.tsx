/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, h2, text, small, footer, hr, button, card, labelRed } from './_styles.ts'

interface ClubBottle {
  title: string
  quantity?: number
  tastingNotes?: string
  pairings?: string
}
interface Props {
  recipientName?: string
  buyerName?: string
  shipmentLabel?: string
  bottles?: ClubBottle[]
  trackingUrl?: string
  trackingNumber?: string
  carrier?: string
  giftMessage?: string
}

const ClubGiftShipmentShippedEmail = ({
  recipientName,
  buyerName,
  shipmentLabel,
  bottles = [],
  trackingUrl,
  trackingNumber,
  carrier,
  giftMessage,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {buyerName ? `Your wine club gift from ${buyerName} just shipped` : 'Your wine club gift just shipped'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {recipientName ? `${recipientName}, your gift is on the way.` : 'Your gift is on the way.'}
        </Heading>
        {shipmentLabel && (
          <Text style={{ ...labelRed, margin: '0 0 14px' }}>{shipmentLabel}</Text>
        )}
        <Text style={text}>
          {buyerName ? <><strong>{buyerName}</strong> gifted you a Rescue Dog Wines club membership</> : 'You\'ve been gifted a Rescue Dog Wines club membership'}
          {' '}— and this month's bottles are on the truck.
        </Text>
        {giftMessage && giftMessage.trim().length > 0 && (
          <Section style={card}>
            <Text style={labelRed}>A note from {buyerName ?? 'the sender'}</Text>
            <Text style={{ ...text, margin: 0, fontStyle: 'italic' }}>"{giftMessage}"</Text>
          </Section>
        )}
        {trackingUrl && (
          <>
            <Button href={trackingUrl} style={button}>Track your shipment</Button>
            {trackingNumber && (
              <Text style={small}>
                {carrier ? `${carrier} ` : ''}tracking #: <strong>{trackingNumber}</strong>
              </Text>
            )}
          </>
        )}
        {bottles.length > 0 && (
          <>
            <Heading style={h2}>What's in the box</Heading>
            {bottles.map((b, i) => (
              <Section key={i} style={card}>
                <Text style={labelRed}>
                  {b.quantity && b.quantity > 1 ? `${b.quantity} × ` : ''}{b.title}
                </Text>
                {b.tastingNotes && (
                  <Text style={{ ...text, margin: '4px 0 8px' }}>{b.tastingNotes}</Text>
                )}
                {b.pairings && (
                  <Text style={small}><strong>Pairs with:</strong> {b.pairings}</Text>
                )}
              </Section>
            ))}
          </>
        )}
        <Hr style={hr} />
        <Text style={small}>
          An adult (21+) signature is required at delivery.
        </Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ClubGiftShipmentShippedEmail,
  subject: (d: Record<string, any>) =>
    d.buyerName ? `Your wine club gift from ${d.buyerName} just shipped` : 'Your wine club gift just shipped',
  displayName: 'Wine club gift — shipment shipped',
  previewData: {
    recipientName: 'Sam',
    buyerName: 'Jordan',
    shipmentLabel: 'March 2026 — Spring Selection',
    giftMessage: 'Happy birthday! Hope you love these.',
    trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=123456789012',
    trackingNumber: '123456789012',
    carrier: 'FedEx',
    bottles: [
      {
        title: '2022 Cabernet Sauvignon',
        quantity: 2,
        tastingNotes: 'Black cherry, cedar, and graphite with a long finish.',
        pairings: 'Grilled ribeye, mushroom risotto.',
      },
    ],
  },
} satisfies TemplateEntry
