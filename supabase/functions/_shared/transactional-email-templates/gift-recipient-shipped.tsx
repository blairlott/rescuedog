/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, h2, text, small, footer, hr, button, card, labelRed } from './_styles.ts'

interface Bottle { title: string; quantity?: number }
interface Props {
  recipientName?: string
  buyerName?: string
  trackingUrl?: string
  trackingNumber?: string
  carrier?: string
  bottles?: Bottle[]
  giftMessage?: string
}

const GiftRecipientShippedEmail = ({
  recipientName,
  buyerName,
  trackingUrl,
  trackingNumber,
  carrier,
  bottles,
  giftMessage,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {buyerName ? `Your gift from ${buyerName} just shipped` : 'Your gift just shipped'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {recipientName ? `${recipientName}, your gift just shipped.` : 'Your gift just shipped.'}
        </Heading>
        <Text style={text}>
          {buyerName ? <><strong>{buyerName}'s</strong> gift to you </> : 'Your gift '}
          is on the truck. An adult 21+ will need to sign for it at delivery.
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
        {bottles && bottles.length > 0 && (
          <>
            <Heading style={h2}>What's in the box</Heading>
            <Section style={card}>
              {bottles.map((b, i) => (
                <Text key={i} style={{ ...text, margin: '0 0 6px' }}>
                  • {b.quantity && b.quantity > 1 ? `${b.quantity} × ` : ''}{b.title}
                </Text>
              ))}
            </Section>
          </>
        )}
        {giftMessage && giftMessage.trim().length > 0 && (
          <Section style={card}>
            <Text style={labelRed}>A note from {buyerName ?? 'the sender'}</Text>
            <Text style={{ ...text, margin: 0, fontStyle: 'italic' }}>"{giftMessage}"</Text>
          </Section>
        )}
        <Hr style={hr} />
        <Text style={small}>
          Every bottle helps a dog find a forever home. Thanks for being part of that.
        </Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: GiftRecipientShippedEmail,
  subject: (d: Record<string, any>) =>
    d.buyerName ? `Your gift from ${d.buyerName} just shipped` : 'Your gift just shipped',
  displayName: 'Gift — shipped (a la carte)',
  previewData: {
    recipientName: 'Sam',
    buyerName: 'Jordan',
    trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=123456789012',
    trackingNumber: '123456789012',
    carrier: 'FedEx',
    bottles: [
      { title: '2022 Cabernet Sauvignon', quantity: 2 },
      { title: '2023 Sauvignon Blanc', quantity: 1 },
    ],
    giftMessage: 'Enjoy!',
  },
} satisfies TemplateEntry
