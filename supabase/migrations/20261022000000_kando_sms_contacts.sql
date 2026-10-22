-- KanDo: kontakter för "📱 Skicka SMS" (via SMSbang-telefonen i Jaktkoll-
-- projektet, se edge function send-sms). Online-only som delade listor —
-- ingen Dexie-synk; kontaktlistan behövs bara när man faktiskt skickar.
-- last_used_at sätts av send-sms så senast använda hamnar överst.
CREATE TABLE IF NOT EXISTS public.kando_sms_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE DEFAULT auth.uid(),
  name         text NOT NULL,
  phone        text NOT NULL,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

ALTER TABLE public.kando_sms_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kando_sms_contacts_own" ON public.kando_sms_contacts;
CREATE POLICY "kando_sms_contacts_own" ON public.kando_sms_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kando_sms_contacts TO authenticated;
