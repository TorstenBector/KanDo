// Tar emot Stripes checkout.session.completed för KonsultKolls
// engångsbetalning (40kr/365 dagar). Anropas okrypterat/oautentiserat direkt
// av Stripe (verify_jwt = false i config.toml) — autenticiteten kommer
// istället från Stripe-signaturen (STRIPE_WEBHOOK_SECRET), inte JWT.
//
// Matchar användaren via client_reference_id, som appen sätter till
// auth-användarens id när betalningslänken öppnas (se Paywall.tsx) — inte
// e-post, som inte är garanterat unikt/stabilt på samma sätt.
import Stripe from "npm:stripe@17.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// service-role-nyckeln behövs för att skriva paid_until — konsultkoll_settings
// har strikt ägar-RLS (user_id = auth.uid()) och webhooken har ingen sådan
// session.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? "", webhookSecret);
  } catch (err) {
    console.error("Ogiltig Stripe-signatur", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;

    if (!userId) {
      console.error("checkout.session.completed utan client_reference_id", session.id);
      return new Response("Missing client_reference_id", { status: 400 });
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("konsultkoll_settings")
      .select("paid_until")
      .eq("user_id", userId)
      .maybeSingle<{ paid_until: string | null }>();

    if (readError) {
      console.error("Kunde inte läsa nuvarande paid_until", readError);
      return new Response("DB read error", { status: 500 });
    }

    // Betalar man innan gamla perioden gått ut förlängs den — istället för
    // att nollställas till "idag + 365 dagar" och tappa redan betald tid.
    const now = Date.now();
    const currentPaidUntil = existing?.paid_until ? new Date(existing.paid_until).getTime() : 0;
    const base = Math.max(now, currentPaidUntil);
    const newPaidUntil = new Date(base + YEAR_MS).toISOString();

    const { error: writeError } = await supabaseAdmin
      .from("konsultkoll_settings")
      .upsert({ user_id: userId, paid_until: newPaidUntil }, { onConflict: "user_id" });

    if (writeError) {
      console.error("Kunde inte uppdatera paid_until", writeError);
      return new Response("DB write error", { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
});
