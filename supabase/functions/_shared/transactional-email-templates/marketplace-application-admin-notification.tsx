/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { main, container, h1, small, footer, card, labelRed } from './_styles.ts'

interface Props {
  businessName?: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  website?: string; businessType?: string; yearsInBusiness?: number;
  categories?: string[]; productDescription?: string; estMonthlyUnits?: number;
  fulfillmentModel?: string; shippingRegions?: string[];
  brandStory?: string; whyPartner?: string; submissionId?: string;
}

const Row = ({ label, value }: { label: string; value?: string }) =>
  value ? <Text style={{ ...small, margin: '4px 0' }}><strong>{label}:</strong> {value}</Text> : null

const MarketplaceApplicationAdminNotification = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New marketplace partner application{p.businessName ? ` — ${p.businessName}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New marketplace partner application</Heading>
        <Section style={card}>
          <Text style={labelRed}>Business</Text>
          <Row label="Business name" value={p.businessName} />
          <Row label="Contact name" value={p.contactName} />
          <Row label="Email" value={p.contactEmail} />
          <Row label="Phone" value={p.contactPhone} />
          <Row label="Website" value={p.website} />
          <Row label="Business type" value={p.businessType} />
          <Row label="Years in business" value={p.yearsInBusiness ? String(p.yearsInBusiness) : undefined} />
        </Section>
        <Section style={card}>
          <Text style={labelRed}>Products</Text>
          <Row label="Categories" value={p.categories?.length ? p.categories.join(', ') : undefined} />
          <Row label="Description" value={p.productDescription} />
          <Row label="Est. monthly units" value={p.estMonthlyUnits ? String(p.estMonthlyUnits) : undefined} />
          <Row label="Fulfillment" value={p.fulfillmentModel} />
          <Row label="Shipping regions" value={p.shippingRegions?.length ? p.shippingRegions.join(', ') : undefined} />
        </Section>
        {(p.brandStory || p.whyPartner) && (
          <Section style={card}>
            <Text style={labelRed}>Story</Text>
            <Row label="Brand story" value={p.brandStory} />
            <Row label="Why partner" value={p.whyPartner} />
          </Section>
        )}
        <Text style={footer}>
          Rescue Dog Wines · marketplace application{p.submissionId ? ` · ref ${p.submissionId.slice(0, 8)}` : ''}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MarketplaceApplicationAdminNotification,
  subject: (d: Record<string, any>) => `New marketplace application${d?.businessName ? `: ${d.businessName}` : ''}`,
  displayName: 'Marketplace partner — internal notification',
  previewData: { businessName: 'Wag Goods Co.', contactName: 'Sam', contactEmail: 'sam@waggoods.com', categories: ['Apparel'], fulfillmentModel: 'self_ship' },
} satisfies TemplateEntry