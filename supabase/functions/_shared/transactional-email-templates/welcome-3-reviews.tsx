/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, hr, button, card, labelRed } from './_styles.ts'

const SITE = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app').replace(/\/$/, '')

interface Props { name?: string; shopUrl?: string }

const Welcome3Reviews = ({ name, shopUrl = `${SITE}/wines` }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>What The Pack is saying about the wines.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>What The Pack is saying.</Heading>
        <Text style={text}>
          You don't have to take our word for it{ name ? `, ${name}` : '' }. Here's
          what real customers told us after their first bottle.
        </Text>

        <Section style={card}>
          <Text style={labelRed}>★★★★★</Text>
          <Text style={{ ...text, margin: '0 0 6px', fontStyle: 'italic' }}>
            "Smooth, balanced, and I love that my purchase actually helps dogs.
            Re-ordering today."
          </Text>
          <Text style={small}>— Verified customer</Text>
        </Section>

        <Section style={card}>
          <Text style={labelRed}>★★★★★</Text>
          <Text style={{ ...text, margin: '0 0 6px', fontStyle: 'italic' }}>
            "The Zinfandel is now my house red. Showed up fast, packaged
            beautifully."
          </Text>
          <Text style={small}>— Verified customer</Text>
        </Section>

        <Button href={shopUrl} style={button}>See the wines</Button>
        <Hr style={hr} />
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Welcome3Reviews,
  subject: 'What The Pack is saying',
  displayName: 'Welcome 3 · Reviews',
  previewData: { name: 'Friend' },
} satisfies TemplateEntry