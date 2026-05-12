
UPDATE public.dropship_skus SET notes = COALESCE(notes, '') ||
  CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n\n' END ||
  'SOURCE: Imported from ' ||
  CASE partner_id
    WHEN 'c4c9ea8c-f4ea-4adb-bb84-37de1bf32fb6'::uuid THEN 'Printify (US providers — Monster Digital FL or Swiftpod CA).'
    WHEN '70b93ed3-b26a-4ca0-b461-b1b0b44dd318'::uuid THEN 'Printful (Charlotte NC fulfillment center).'
    WHEN 'd430987b-7b6a-4aa7-905a-a646f3633e39'::uuid THEN 'Gooten (US partner network — TN/OH/PA).'
    WHEN '2b46272e-709f-417b-a9b4-dc183c57f97d'::uuid THEN 'Sticker Mule (Amsterdam NY US factory).'
    WHEN '2bcc0335-066e-4a95-8b84-a554dd8ab009'::uuid THEN '4imprint (Oshkosh WI US warehouse).'
    ELSE 'verified US-fulfillment partner.'
  END
WHERE notes IS NULL OR notes NOT LIKE 'SOURCE:%';
