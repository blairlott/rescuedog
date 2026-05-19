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
  memberName?: string
  shipmentLabel?: string  // e.g. "March 2026 — Spring Selection"
  bottles?: ClubBottle[]
  trackingUrl?: string
  trackingNumber?: string
  carrier?: string
}

const ClubShipmentShippedEmail = ({
  memberName,
  shipmentLabel,
  bottles = [],
  trackingUrl,
  trackingNumber,
  carrier,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {shipmentLabel ? `Your ${shipmentLabel} club shipment just shipped` : 'Your club shipment just shipped'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {memberName ? `${memberName}, your club shipment is on the way.` : 'Your club shipment is on the way.'}
        </Heading>
        {shipmentLabel && (
          <Text style={{ ...labelRed, margin: '0 0 14px' }}>{shipmentLabel}</Text>
        )}
        <Text style={text}>
          Thank you for being part of The Pack. Below is what's in this shipment, with
          tasting notes and pairing ideas from our team.
        </Text>
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
            <Heading style={h2}>In this month's box</Heading>
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
          An adult (21+) signature is required at delivery. If you need to reroute, reply
          to this email and we'll help.
        </Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ClubShipmentShippedEmail,
  subject: (d: Record<string, any>) =>
    d.shipmentLabel ? `Your ${d.shipmentLabel} club shipment is on the way` : 'Your club shipment is on the way',
  displayName: 'Wine club — shipment shipped',
  previewData: {
    memberName: 'Jordan',
    shipmentLabel: 'March 2026 — Spring Selection',
    trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=123456789012',
    trackingNumber: '123456789012',
    carrier: 'FedEx',
    bottles: [
      {
        title: '2022 Cabernet Sauvignon',
        quantity: 2,
        tastingNotes: 'Black cherry, cedar, and graphite with a long, structured finish.',
        pairings: 'Grilled ribeye, mushroom risotto, aged hard cheeses.',
      },
      {
        title: '2023 Sauvignon Blanc',
        quantity: 1,
        tastingNotes: 'Crisp grapefruit, white peach, and a flinty mineral lift.',
        pairings: 'Goat cheese, ceviche, herb-roasted chicken.',
      },
    ],
  },
} satisfies TemplateEntry
