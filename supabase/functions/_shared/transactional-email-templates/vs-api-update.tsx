/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Change {
  summary?: string
  type?: string
  path?: string
  method?: string
}

interface Props {
  changeCount?: number
  changes?: Change[]
  dashboardUrl?: string
}

const VsApiUpdate = ({ changeCount = 0, changes = [], dashboardUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Vinoshipper API change detected — {changeCount} update{changeCount === 1 ? '' : 's'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Vinoshipper API update detected</Heading>
        <Text style={small}>
          The daily watcher found {changeCount} change{changeCount === 1 ? '' : 's'} in the Vinoshipper API since the last snapshot.
          Review below to see if any unlock new functionality we can ship.
        </Text>
        <Section style={card}>
          <Text style={labelRed}>Changes</Text>
          {changes.map((c, i) => (
            <Text key={i} style={{ ...small, margin: '6px 0' }}>
              <strong>{c.type || 'change'}</strong>
              {c.method && c.path ? ` — ${c.method} ${c.path}` : ''}
              <br />
              <span style={{ color: '#666' }}>{c.summary}</span>
            </Text>
          ))}
          {changes.length === 0 && <Text style={small}>(no detail rows attached)</Text>}
        </Section>
        {dashboardUrl && (
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={dashboardUrl} style={{ backgroundColor: '#c30017', color: '#ffffff', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' }}>
              Open API watcher
            </Button>
          </Section>
        )}
        <Hr />
        <Text style={footer}>Vinoshipper API Watcher · Rescue Dog Wines</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: VsApiUpdate,
  subject: (d: Record<string, any>) => `Vinoshipper API update — ${d?.changeCount ?? 0} new change${d?.changeCount === 1 ? '' : 's'}`,
  displayName: 'Vinoshipper API update',
  previewData: {
    changeCount: 2,
    changes: [
      { type: 'endpoint_added', method: 'PUT', path: '/api/v3/p/memberships/{id}/next-shipment', summary: 'New endpoint: PUT /api/v3/p/memberships/{id}/next-shipment' },
      { type: 'probe_flip', method: 'GET', path: '/api/v3/p/customers/{id}/payment-methods', summary: 'Endpoint is now LIVE (was 404, now 200)' },
    ],
    dashboardUrl: 'https://rescuedog.lovable.app/crm/vinoshipper-api',
  },
} satisfies TemplateEntry