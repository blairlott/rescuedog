/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Item {
  quantity: number
  product_title: string
  partner_sku?: string | null
  sku?: string | null
}

interface Props {
  orderShortId?: string
  customerName?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  items?: Item[]
}

const DropshipPartnerPoEmail = ({
  orderShortId = '',
  customerName = '',
  street = '',
  city = '',
  state = '',
  zip = '',
  items = [],
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New drop-ship PO #{orderShortId}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New Drop-Ship Order #{orderShortId}</Heading>
        <Section>
          <Text style={label}>ITEMS</Text>
          {items.map((it, i) => (
            <Text key={i} style={text}>
              • {it.quantity}× {it.product_title} ({it.partner_sku || it.sku || '—'})
            </Text>
          ))}
        </Section>
        <Section>
          <Text style={label}>SHIP TO</Text>
          <Text style={text}>{customerName}</Text>
          <Text style={text}>{street}</Text>
          <Text style={text}>{[city, state].filter(Boolean).join(', ')} {zip}</Text>
        </Section>
        <Text style={small}>Reply with tracking when shipped.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DropshipPartnerPoEmail,
  subject: (data: Record<string, any>) => `[RDW] New drop-ship PO #${data?.orderShortId ?? ''}`,
  displayName: 'Drop-ship partner PO',
  previewData: {
    orderShortId: 'a1b2c3d4',
    customerName: 'Sample Customer',
    street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701',
    items: [{ quantity: 2, product_title: 'Sample Tee', partner_sku: 'SKU-1' }],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '560px' }
const h1 = { fontSize: '20px', fontWeight: 700, color: '#000', margin: '0 0 16px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const label = { fontSize: '11px', color: '#c30017', fontWeight: 700, letterSpacing: '1px', margin: '14px 0 6px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.5', margin: '2px 0' }
const small = { fontSize: '12px', color: '#999', margin: '20px 0 0' }