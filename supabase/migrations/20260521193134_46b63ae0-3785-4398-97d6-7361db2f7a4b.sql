
-- Email test mode setting: routes all transactional form emails to Blair + Lindy
INSERT INTO public.app_settings (key, value)
VALUES (
  'email_test_mode',
  jsonb_build_object(
    'enabled', true,
    'recipients', jsonb_build_array(
      'blair.lott@rescuedogwines.com',
      'default-blair.lott@lindymail.ai'
    ),
    'exempt_templates', jsonb_build_array(
      'wine-subscription-card-expiring',
      'wine-subscription-payment-failed',
      'club-shipment-shipped',
      'club-gift-shipment-shipped'
    ),
    'note', 'Test mode: All form-triggered emails route only to Blair + Lindy. Subscribe & Save (S&S) templates are exempt. Disable before launch.'
  )
)
ON CONFLICT (key) DO NOTHING;

-- Form email inventory — editable catalog of every form on the site and the
-- emails it triggers (customer-facing + internal notifications)
CREATE TABLE IF NOT EXISTS public.form_email_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_name text NOT NULL,
  page_path text,
  trigger_event text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('customer', 'team', 'partner')),
  recipient text NOT NULL,
  template_name text,
  notes text,
  test_mode_exempt boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.form_email_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_email_inventory readable by cms editors"
ON public.form_email_inventory FOR SELECT
USING (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "form_email_inventory writable by admins"
ON public.form_email_inventory FOR ALL
USING (public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER form_email_inventory_touch
BEFORE UPDATE ON public.form_email_inventory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the inventory with current site forms
INSERT INTO public.form_email_inventory
(form_name, page_path, trigger_event, audience, recipient, template_name, notes, test_mode_exempt, sort_order) VALUES
('Contact form', '/contact', 'submit', 'team', 'info@rescuedogwines.com', NULL, 'No automated email currently — Mailchimp handles list capture.', false, 10),
('Wholesale inquiry', '/wholesale', 'submit', 'customer', '{form.email}', 'wholesale-customer-confirmation', 'Confirmation to inquirer.', false, 20),
('Wholesale inquiry', '/wholesale', 'submit', 'team', 'regional contact (Jake or Jana) + info@ + blair@', 'wholesale-admin-notification', 'Region-routed internal notification.', false, 21),
('Wine club signup', '/wine-club', 'membership_created', 'customer', '{member.email}', 'welcome-1-story (welcome series)', 'Triggers 5-step welcome series unless Vinoshipper-imported.', false, 30),
('Wine club shipment', 'internal', 'shipment_shipped', 'customer', '{member.email}', 'club-shipment-shipped', 'S&S — exempt from test mode.', true, 31),
('Wine club gift shipment', 'internal', 'gift_shipment_shipped', 'customer', '{recipient.email}', 'club-gift-shipment-shipped', 'S&S — exempt from test mode.', true, 32),
('Wine subscription card expiring', 'internal', 'card_expiring', 'customer', '{member.email}', 'wine-subscription-card-expiring', 'S&S — exempt from test mode.', true, 33),
('Wine subscription payment failed', 'internal', 'payment_failed', 'customer', '{member.email}', 'wine-subscription-payment-failed', 'S&S — exempt from test mode.', true, 34),
('Ambassador signup', '/ambassadors/signup', 'submit', 'customer', '{applicant.email}', 'ambassador-welcome', 'Sent after approval.', false, 40),
('Donation request', '/donations', 'submit', 'customer', '{form.email}', 'donation-customer-confirmation', 'Receipt for 501(c) request.', false, 50),
('Donation request', '/donations', 'submit', 'team', 'info@rescuedogwines.com', 'donation-admin-notification', 'Internal donation triage.', false, 51),
('Event RSVP', '/events/:slug', 'rsvp_submit', 'customer', '{rsvp.email}', 'event-rsvp-confirm (inline)', 'Tasting/ambassador event confirmation.', false, 60),
('Event reminders', 'internal', 'event_reminder_cron', 'customer', '{rsvp.email}', 'event-reminder-sweep (inline)', 'Pre-event reminder.', false, 61),
('Gift certificate purchase', '/gifts', 'gift_created', 'customer', '{recipient.email}', 'gift-recipient-incoming / gift-recipient-shipped', 'Two-stage gift recipient notice.', false, 70),
('Welcome series (steps 2–5)', 'internal', 'cron_dispatch', 'customer', '{user.email}', 'welcome-2-sampler / welcome-3-reviews / welcome-4-mission / welcome-5-nudge', 'Scheduled drip after signup.', false, 80),
('Merch abandoned checkout', 'internal', 'cron_sweep', 'customer', '{cart.email}', 'merch-checkout-reminder', 'Re-engages abandoned merch checkouts.', false, 90),
('Stale account alert', 'internal', 'cron', 'team', 'sales rep + summary recipients', 'stale-accounts-rep-alert / stale-accounts-summary', 'CRM staleness alerts.', false, 100),
('Dropship partner PO', 'internal', 'order_created', 'partner', 'dropship partner', 'dropship-partner-po', 'Outbound to fulfillment partner.', false, 110),
('Wine club staff action', 'internal', 'admin_action', 'team', 'wine club manager', 'wine-club-staff-action', 'Internal staff notification.', false, 120),
('Kennel access invite', '/crm', 'invite', 'team', '{invitee.email}', 'kennel-access-invite', 'Internal CRM/Kennel role invite.', false, 130),
('Reviewer invite', 'internal', 'review_request', 'team', '{reviewer.email}', 'reviewer-invite', 'Internal review/approval invite.', false, 140);
