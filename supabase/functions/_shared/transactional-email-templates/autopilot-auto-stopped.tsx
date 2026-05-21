/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Rescue Dog Wines · Kennel'
const DASHBOARD_URL =
  `${Deno.env.get('PUBLIC_SITE_URL') ?? 'https://shopify-buddy-b2b.lovable.app'}/kennel/instacart-ads`

interface Props {
  platform?: string
  reason?: string
  reasonLabel?: string
  stoppedAt?: string
  errorPct?: number | null
  errorSample?: number | null
  maxErrorPct?: number | null
  roas?: number | null
  minRoas?: number | null
  spendCents?: number | null
  salesCents?: number | null
  windowDays?: number | null
  detailJson?: string
}

const REASON_LABELS: Record<string, string> = {
  error_rate_exceeded: 'Error rate exceeded threshold',
  roas_below_threshold: 'Trailing ROAS dropped below threshold',
}

function pct(n: number | null | undefined) {
  return n == null ? '—' : `${Number(n).toFixed(1)}%`
}
function num(n: number | null | undefined, digits = 2) {
  return n == null ? '—' : Number(n).toFixed(digits)
}
function dollars(c: number | null | undefined) {
  return c == null ? '—' : `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const AutopilotAutoStoppedEmail = ({
  platform = 'Instacart',
  reason = 'unknown',
  reasonLabel,
  stoppedAt,
  errorPct, errorSample, maxErrorPct,
  roas, minRoas, spendCents, salesCents, windowDays,
  detailJson,
}: Props) => {
  const label = reasonLabel || REASON_LABELS[reason] || reason
  const isErr = reason === 'error_rate_exceeded'
  const isRoas = reason === 'roas_below_threshold'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{platform} autopilot auto-stopped — {label}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={banner}>
            <Text style={bannerLabel}>AUTOPILOT AUTO-STOPPED</Text>
            <Heading style={h1}>{platform} autopilot has paused itself</Heading>
            <Text style={subText}>{label}</Text>
          </Section>

          <Section style={metaBox}>
            <Text style={metaRow}><strong>Reason code:</strong> <code>{reason}</code></Text>
            {stoppedAt && (
              <Text style={metaRow}><strong>Stopped at:</strong> {new Date(stoppedAt).toLocaleString()}</Text>
            )}
          </Section>

          {isErr && (
            <Section style={metricsBox}>
              <Text style={metricsTitle}>ERROR-RATE SWITCH</Text>
              <Text style={metric}>
                Measured error rate: <strong>{pct(errorPct)}</strong>
                {errorSample != null && <span style={muted}> (over {errorSample} recent actions)</span>}
              </Text>
              <Text style={metric}>
                Threshold: <strong>{pct(maxErrorPct)}</strong>
              </Text>
            </Section>
          )}

          {isRoas && (
            <Section style={metricsBox}>
              <Text style={metricsTitle}>ROAS SWITCH</Text>
              <Text style={metric}>
                Trailing ROAS: <strong>{num(roas)}x</strong>
                {windowDays != null && <span style={muted}> (last {windowDays} days)</span>}
              </Text>
              <Text style={metric}>
                Minimum ROAS: <strong>{num(minRoas)}x</strong>
              </Text>
              <Text style={metric}>
                Spend: <strong>{dollars(spendCents)}</strong> · Sales: <strong>{dollars(salesCents)}</strong>
              </Text>
            </Section>
          )}

          <Hr style={hr} />

          <Heading as="h2" style={h2}>Next steps to re-enable</Heading>
          <Text style={text}>
            1. Open the {platform} dashboard and review the most recent autopilot evaluations + error log.
          </Text>
          <Text style={text}>
            2. Investigate the underlying cause:
            {isErr && ' look for failing API calls, expired credentials, or rejected bids.'}
            {isRoas && ' look for budget pacing issues, audience changes, or under-performing keywords.'}
            {!isErr && !isRoas && ' review the detail payload below.'}
          </Text>
          <Text style={text}>
            3. Once resolved, click <strong>Acknowledge &amp; Re-enable</strong> on the auto-stop banner.
            (Use <strong>Snooze 24h</strong> if you need more time before flipping it back on.)
          </Text>

          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={DASHBOARD_URL} style={cta}>Open Autopilot Dashboard</Button>
          </Section>

          {detailJson && (
            <Section>
              <Text style={metricsTitle}>DIAGNOSTIC DETAIL</Text>
              <pre style={pre}>{detailJson}</pre>
            </Section>
          )}

          <Text style={footer}>
            Sent automatically by {SITE_NAME} when an autopilot kill-switch trips. Consumer/manual
            campaign management is unaffected — only autopilot execution is paused.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AutopilotAutoStoppedEmail,
  subject: (data: Record<string, any>) => {
    const platform = data?.platform || 'Instacart'
    const label = data?.reasonLabel || REASON_LABELS[data?.reason] || data?.reason || 'auto-stop'
    return `[Autopilot Auto-Stopped] ${platform} — ${label}`
  },
  displayName: 'Autopilot auto-stopped',
  previewData: {
    platform: 'Instacart',
    reason: 'error_rate_exceeded',
    stoppedAt: new Date().toISOString(),
    errorPct: 32.5, errorSample: 48, maxErrorPct: 25,
    detailJson: '{\n  "failures": 16,\n  "window": 48\n}',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '600px' }
const banner = { backgroundColor: '#c30017', padding: '20px 22px', marginBottom: '16px' }
const bannerLabel = { color: '#ffffff', fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', margin: '0 0 6px' }
const h1 = { color: '#ffffff', fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }
const subText = { color: '#ffe1e4', fontSize: '14px', margin: 0 }
const h2 = { fontSize: '16px', fontWeight: 700, color: '#000', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '24px 0 10px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.55', margin: '0 0 10px' }
const metaBox = { border: '1px solid #eee', padding: '12px 14px', margin: '0 0 12px' }
const metaRow = { fontSize: '13px', color: '#333', margin: '2px 0' }
const metricsBox = { backgroundColor: '#fafafa', border: '1px solid #eee', padding: '14px 16px', margin: '0 0 12px' }
const metricsTitle = { fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '1px', margin: '0 0 8px' }
const metric = { fontSize: '14px', color: '#111', margin: '4px 0' }
const muted = { color: '#888', fontWeight: 400 }
const hr = { borderColor: '#eee', margin: '20px 0' }
const cta = { backgroundColor: '#000', color: '#fff', padding: '12px 22px', fontWeight: 700, fontSize: '13px', textDecoration: 'none', letterSpacing: '0.5px', textTransform: 'uppercase' as const }
const pre = { backgroundColor: '#f5f5f5', border: '1px solid #e5e5e5', padding: '10px 12px', fontSize: '11px', lineHeight: '1.45', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, margin: 0 }
const footer = { fontSize: '11px', color: '#999', margin: '24px 0 0', lineHeight: '1.5' }
