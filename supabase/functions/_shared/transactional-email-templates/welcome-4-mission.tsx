/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, hr, button, buttonOutline, card, labelRed } from './_styles.ts'

const SITE = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app').replace(/\/$/, '')

interface Props { name?: string; rescuesUrl?: string; shopUrl?: string }

const Welcome4Mission = ({ name, rescuesUrl = `${SITE}/rescues`, shopUrl = `${SITE}/wines` }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Where the wine goes — meet our rescue partners.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Where the wine goes.</Heading>
        <Text style={text}>
          The mission is simple{ name ? `, ${name}` : '' }: helping dogs find their
          forever home. We do that by partnering with rescues across the country —
          shelters, transport crews, foster networks, medical funds.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>OUR RESCUE PARTNERS</Text>
          <Text style={{ ...text, margin: '0 0 14px' }}>
            Every order you place backs a real organization on the ground. See
            who we work with and the dogs they're moving toward homes right now.
          </Text>
          <Button href={rescuesUrl} style={buttonOutline}>Meet the partners</Button>
        </Section>
        <Text style={text}>
          When you're ready to pour with purpose:
        </Text>
        <Button href={shopUrl} style={button}>Shop the wines</Button>
        <Hr style={hr} />
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Welcome4Mission,
  subject: 'Where the wine goes',
  displayName: 'Welcome 4 · Mission',
  previewData: { name: 'Friend' },
} satisfies TemplateEntry