/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, button, card, labelRed } from './_styles.ts'

interface Props {
  memberName?: string
  productTitle?: string
  cardLast4?: string
  expMonth?: number
  expYear?: number
  updateCardUrl?: string
}

const pad = (n?: number) => (typeof n === 'number' ? String(n).padStart(2, '0') : '')

const WineSubCardExpiringEmail = ({
  memberName,
  productTitle,
  cardLast4,
  expMonth,
  expYear,
  updateCardUrl = 'https://www.vinoshipper.com/account',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your card on file is about to expire — update it to keep your wine flowing.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {memberName ? `${memberName}, your card is about to expire.` : 'Your card is about to expire.'}
        </Heading>
        <Text style={text}>
          Heads up — the card on file for your wine subscription is set to expire
          soon. Update it now and your next shipment will process without a hitch.
        </Text>

        <div style={card}>
          {productTitle && (
            <>
              <Text style={labelRed}>Subscription</Text>
              <Text style={{ ...text, margin: '0 0 8px' }}>{productTitle}</Text>
            </>
          )}
          {(cardLast4 || expMonth) && (
            <>
              <Text style={labelRed}>Card on file</Text>
              <Text style={{ ...text, margin: 0 }}>
                {cardLast4 ? `•••• ${cardLast4}` : 'Card on file'}
                {expMonth && expYear ? ` — expires ${pad(expMonth)}/${String(expYear).slice(-2)}` : ''}
              </Text>
            </>
          )}
        </div>

        <Button href={updateCardUrl} style={button}>Update payment method</Button>

        <Text style={small}>
          Payments are handled securely by Vinoshipper, our compliance and payment
          partner.
        </Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WineSubCardExpiringEmail,
  subject: 'Your card on file is about to expire',
  displayName: 'Wine subscription — card expiring soon',
  previewData: {
    memberName: 'Jordan',
    productTitle: 'Rescue Reds — 6 bottle case',
    cardLast4: '4242',
    expMonth: 6,
    expYear: 2026,
    updateCardUrl: 'https://www.vinoshipper.com/account',
  },
} satisfies TemplateEntry