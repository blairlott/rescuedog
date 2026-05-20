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
  attemptCount?: number
  updateCardUrl?: string
  stage?: 1 | 2 | 3 // 1 = first notice, 2 = reminder, 3 = final / paused
}

const subjectFor = (stage?: number) =>
  stage === 3
    ? 'Your wine subscription has been paused'
    : stage === 2
      ? "Reminder: update your card to keep your wine shipments coming"
      : "We couldn't process your wine subscription payment"

const WineSubPaymentFailedEmail = ({
  memberName,
  productTitle,
  attemptCount,
  updateCardUrl = 'https://www.vinoshipper.com/account',
  stage = 1,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {stage === 3
        ? 'Your subscription is paused — update your card to resume.'
        : "We weren't able to charge your card for your next wine shipment."}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {stage === 3
            ? (memberName ? `${memberName}, your subscription is paused.` : 'Your subscription is paused.')
            : (memberName ? `${memberName}, we need to update your card.` : 'We need to update your card.')}
        </Heading>

        <Text style={text}>
          {stage === 3
            ? "After several attempts, we weren't able to charge the card on file, so we've paused your wine subscription to avoid further declines. Your bottles are waiting — update your payment method and we'll resume your next shipment right away."
            : "We tried to charge the card on file for your upcoming wine shipment and it didn't go through. This usually means the card expired, was replaced, or your bank flagged the charge."}
        </Text>

        {productTitle && (
          <div style={card}>
            <Text style={labelRed}>Subscription</Text>
            <Text style={{ ...text, margin: 0 }}>{productTitle}</Text>
            {typeof attemptCount === 'number' && attemptCount > 0 && (
              <Text style={{ ...small, margin: '6px 0 0' }}>
                Failed attempts: <strong>{attemptCount}</strong>
              </Text>
            )}
          </div>
        )}

        <Button href={updateCardUrl} style={button}>Update payment method</Button>

        <Text style={small}>
          Card updates are handled securely by Vinoshipper, our compliance and
          payment partner. Once your card is updated, your next shipment will
          process automatically — no action needed on our end.
        </Text>

        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WineSubPaymentFailedEmail,
  subject: (d: Record<string, any>) => subjectFor(d.stage),
  displayName: 'Wine subscription — payment failed (dunning)',
  previewData: {
    memberName: 'Jordan',
    productTitle: 'Rescue Reds — 6 bottle case',
    attemptCount: 2,
    stage: 2,
    updateCardUrl: 'https://www.vinoshipper.com/account',
  },
} satisfies TemplateEntry