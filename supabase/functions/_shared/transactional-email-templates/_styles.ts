// Shared brand styles for Rescue Dog Wines transactional emails
export const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"Nunito Sans", "Avenir Next", Arial, sans-serif',
}
export const container = { padding: '32px 28px', maxWidth: '600px' }
export const h1 = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#000000',
  margin: '0 0 18px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}
export const h2 = {
  fontSize: '16px',
  fontWeight: 700,
  color: '#000000',
  margin: '24px 0 10px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}
export const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
export const small = { fontSize: '13px', color: '#666', lineHeight: '1.5', margin: '0 0 8px' }
export const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
export const hr = { borderColor: '#e5e5e5', margin: '24px 0 16px' }
export const button = {
  backgroundColor: '#c30017',
  color: '#ffffff',
  padding: '12px 22px',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  display: 'inline-block',
}
export const buttonOutline = {
  ...button,
  backgroundColor: '#ffffff',
  color: '#000000',
  border: '1px solid #000000',
}
export const card = {
  border: '1px solid #e5e5e5',
  padding: '16px 18px',
  margin: '0 0 16px',
}
export const labelRed = {
  fontSize: '11px',
  color: '#c30017',
  fontWeight: 700,
  letterSpacing: '1px',
  textTransform: 'uppercase' as const,
  margin: '0 0 6px',
}
export const kvRow = { padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: '13px' as const }