# VORA mobile (Expo / React Native — iOS, Android, web)

This is the VORA app client. It uses the **same Supabase backend** as the web app in the repository root (auth, trusted devices,
credit wallet, AI agents, workouts). No backend lives in this folder and no secret key ships in the app.

## Run
```bash
cd mobile
npm install
cp .env.example .env.local      # public project URL + publishable key (use the STAGING project for development)
npx expo start                  # open in Expo Go (scan the QR code), or press w for web
```
Checks: `npm run typecheck`, `npx expo-doctor`, `npm run export:web`, `npm run export:native` (bundles iOS + Android JS).

## Open on an iPhone
1. Install **Expo Go** from the App Store (it must support Expo SDK 58).
2. On a computer on the **same Wi-Fi** as the phone: `cd mobile && npm install && npx expo start`.
3. Open the iPhone **Camera**, scan the QR code shown in the terminal, and tap the banner. The app opens inside Expo Go.
   If the phone cannot reach the computer (guest Wi-Fi, firewall), run `npx expo start --tunnel` instead.
4. A build that installs without Expo Go (TestFlight / internal distribution) needs an Expo account and an Apple Developer account: `eas build -p ios`.

The app only works when the Supabase project in `.env.local` is running (a paused project shows a blank or failing sign-in).

## Product
VORA is an **AI Personal Trainer**: ONE trainer chat (text, voice message, photo, video) that adapts to the member.
- **Free:** account, onboarding, exercise library with the body map, workout log, plans, support, and exactly **one free trial conversation** with the trainer (server-limited).
- **VORA Coins (pay as you go):** a member who bought coins can keep chatting; every request shows its price first. No personal plans, no nutrition.
- **Subscribers:** ongoing coaching, personalised plans, and nutrition guidance when the plan includes it.

## Screens (order follows the approved app reference)
Tabs: Home · Workouts (body map, exercises, rest timer, workout log) · Nutrition (subscribers) · Trainer (the single AI chat) · Account.
Stack: recipe detail, VORA Coins wallet, plans & VORA Coins store, customer support (ticket form), trusted devices, trainer & privacy settings.
Auth: sign in / sign up, e-mail code, device verification.

## Rules the app keeps (enforced by the server, mirrored in the UI)
- Private screens open only on a **trusted device** (6-digit e-mail code); an account can be active on **two** trusted devices.
- Access to the trainer is decided by the server: subscription, else the trial conversation, else purchased VORA Coins.
- For paying members every request shows its **exact VORA Coins cost** and needs a confirmation.
- Media is sent only after an explicit consent and the system permission; it is used for that one request and not stored.
  If the configured AI model cannot inspect a file, the trainer says so — it never guesses.
- The trainer answers fitness topics only and politely redirects anything else.
- **Payments:** UPayments hosted checkout (sandbox). The server verifies every order with the provider; the app never treats the
  return page as proof. Renewal is manual (no automatic charge).
- **Store rule:** Apple and Google require their own billing for digital goods inside store-distributed apps (outside a few regions
  such as the US storefront / EEA programs). Checkout is therefore enabled on the web app and, in native builds, only when
  `EXPO_PUBLIC_NATIVE_CHECKOUT=1` (internal sandbox testing). A store build must leave it unset or use Apple IAP / Google Play Billing.

## Not done yet
Automatic renewal (UPayments supports saved-card auto-deduct; deliberately not wired), real-time voice calls, push notifications,
App Store / Play builds (need an Expo account and store accounts), Apple IAP / Play Billing. AI replies are mock until a provider key and budget are set.
