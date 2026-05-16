/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, hr, button, card, labelRed } from './_styles.ts'

const SITE = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app').replace(/\/$/, '')

interface Props { name?: string; samplerUrl?: string }

const Welcome2Sampler = ({ name, samplerUrl = `${SITE}/wines` }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Start with the Sampler — three wines, one easy pour.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `${name}, start with the sampler.` : 'Start with the sampler.'}</Heading>
        <Text style={text}>
          Not sure where to start? We built the Sampler exactly for this moment.
          Three of our most-loved wines, hand-picked, shipped in one box.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>WHY THE SAMPLER</Text>
          <Text style={{ ...text, margin: '0 0 6px' }}>· Three distinct styles to find your favorite</Text>
          <Text style={{ ...text, margin: '0 0 6px' }}>· Shipping included on 6+ bottles</Text>
          <Text style={{ ...text, margin: '0 0 14px' }}>· Every bottle funds a rescue partner</Text>
          <Button href={samplerUrl} style={button}>Shop the sampler</Button>
        </Section>
        <Hr style={hr} />
        <Text style={small}>Questions about a varietal or pairing? Just reply.</Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Welcome2Sampler,
  subject: 'The easiest first pour: our Sampler',
  displayName: 'Welcome 2 · Sampler',
  previewData: { name: 'Friend' },
} satisfies TemplateEntry