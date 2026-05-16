/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, hr, button, card, labelRed } from './_styles.ts'

const SITE = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app').replace(/\/$/, '')

interface Props { name?: string; samplerUrl?: string; clubUrl?: string }

const Welcome5Nudge = ({ name, samplerUrl = `${SITE}/wines`, clubUrl = `${SITE}/wine-club` }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>One last nudge — pick your starting point.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `${name}, pick your starting point.` : 'Pick your starting point.'}</Heading>
        <Text style={text}>
          We've shared the story, the wines, the people we help. Two easy ways in:
        </Text>

        <Section style={card}>
          <Text style={labelRed}>OPTION 1 · TRY IT</Text>
          <Text style={{ ...text, margin: '0 0 14px' }}>
            The Sampler. Three wines, one box, ships nationwide.
          </Text>
          <Button href={samplerUrl} style={button}>Shop the sampler</Button>
        </Section>

        <Section style={card}>
          <Text style={labelRed}>OPTION 2 · JOIN THE PACK</Text>
          <Text style={{ ...text, margin: '0 0 14px' }}>
            Quarterly shipments, member pricing, early access to small lots.
          </Text>
          <Button href={clubUrl} style={button}>Explore the club</Button>
        </Section>

        <Hr style={hr} />
        <Text style={small}>
          No pressure either way — you're already part of how we help dogs find
          homes just by being here.
        </Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Welcome5Nudge,
  subject: 'Two easy ways to start',
  displayName: 'Welcome 5 · Nudge',
  previewData: { name: 'Friend' },
} satisfies TemplateEntry