/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, text, small, footer, hr, button, buttonOutline, card, labelRed } from './_styles.ts'

const SITE = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app').replace(/\/$/, '')

interface Props { name?: string; shopUrl?: string; storyUrl?: string }

const Welcome1Story = ({ name, shopUrl = `${SITE}/wines`, storyUrl = `${SITE}/vineyard` }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to The Pack — every bottle helps a dog find a home.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Welcome, ${name}.` : 'Welcome to the pack.'}</Heading>
        <Text style={text}>
          We're Rescue Dog Wines — small-lot California wine with a clear mission:
          helping dogs find their forever home. Every bottle you pour funds rescue
          partners on the ground doing the hard, hopeful work.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>OUR STORY</Text>
          <Text style={{ ...text, margin: '0 0 14px' }}>
            One family, one vineyard in Lodi, and a long list of rescues we wanted
            to help. We turned the wine into the engine.
          </Text>
          <Button href={storyUrl} style={buttonOutline}>Meet the vineyard</Button>
        </Section>
        <Text style={text}>
          Ready to taste it? The Sampler is the easiest way in — three wines,
          curated, ships nationwide.
        </Text>
        <Button href={shopUrl} style={button}>Shop the wines</Button>
        <Hr style={hr} />
        <Text style={small}>Reply to this email anytime — a real human reads it.</Text>
        <Text style={footer}>— The Rescue Dog Wines team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Welcome1Story,
  subject: 'Welcome to the pack 🐾',
  displayName: 'Welcome 1 · Story',
  previewData: { name: 'Friend' },
} satisfies TemplateEntry