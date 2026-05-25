/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, hr, button, card, labelRed } from './_styles.ts'

const SITE = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://rescuedogwines.com').replace(/\/$/, '')

interface Props {
  name?: string
  invoice?: string
  orderUrl?: string
}

const VsOrderConfirmationFollowup = ({ name, invoice, orderUrl }: Props) => {
  const href = orderUrl || (invoice ? `${SITE}/account/orders/${invoice}` : `${SITE}/account/orders`)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your order is confirmed — view it on RescueDogWines.com</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {name ? `Thanks, ${name} — your order is confirmed.` : 'Your order is confirmed.'}
          </Heading>
          <Text style={text}>
            Payment went through and your wine is being prepared for shipment. Every bottle
            helps a rescue dog find their forever home.
          </Text>
          <Section style={card}>
            <Text style={labelRed}>ORDER {invoice ? `#${invoice}` : ''}</Text>
            <Text style={{ ...text, margin: '0 0 14px' }}>
              View your order, track shipment, and see your rescue impact on your account page.
            </Text>
            <Button href={href} style={button}>View your order</Button>
          </Section>
          <Hr style={hr} />
          <Text style={small}>
            Questions about your order? Just reply to this email and a real human on our team will help.
          </Text>
          <Text style={footer}>— The Rescue Dog Wines team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: VsOrderConfirmationFollowup,
  subject: 'Your order is confirmed — view it on RescueDogWines.com',
  displayName: 'Vinoshipper · Order confirmed follow-up',
  previewData: { name: 'Friend', invoice: '96354108417' },
} satisfies TemplateEntry