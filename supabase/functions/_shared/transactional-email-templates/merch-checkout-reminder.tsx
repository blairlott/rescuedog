/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, hr, button, card, labelRed } from './_styles.ts'

interface Props {
  name?: string
  checkoutUrl: string
  itemCount?: number
  subtotalDollars?: string
  wineOrderId?: string
}

const MerchCheckoutReminder = ({
  name,
  checkoutUrl,
  itemCount,
  subtotalDollars,
  wineOrderId,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your merch is still waiting — one tap to finish.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name}, your merch is one tap away.` : 'Your merch is one tap away.'}
        </Heading>
        <Text style={text}>
          Thanks for your wine order{wineOrderId ? ` (${wineOrderId})` : ''}.
          You also had{itemCount ? ` ${itemCount}` : ''} merch item{itemCount === 1 ? '' : 's'}
          {' '}in your cart that check out separately through our secure merch store.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>YOUR MERCH CART</Text>
          <Text style={{ ...text, margin: '0 0 14px' }}>
            {itemCount ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Your items'}
            {subtotalDollars ? ` — $${subtotalDollars}` : ''}, ready to go.
          </Text>
          <Button href={checkoutUrl} style={button}>Complete merch checkout</Button>
        </Section>
        <Text style={text}>
          Every order helps fund a rescue partner. Thank you for showing up for the dogs.
        </Text>
        <Hr style={hr} />
        <Text style={small}>
          This link expires in 24 hours. Reply to this email if you have any trouble.
        </Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MerchCheckoutReminder,
  subject: 'Your merch is still waiting — one tap to finish',
  displayName: 'Merch checkout reminder',
  previewData: {
    name: 'Sam',
    checkoutUrl: 'https://example.com/checkout/abc',
    itemCount: 2,
    subtotalDollars: '49.00',
    wineOrderId: 'SIM-123',
  },
} satisfies TemplateEntry