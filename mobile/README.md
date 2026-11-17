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

## Product
VORA is an **AI Personal Trainer**: ONE trainer chat (text, voice message, photo, video) that adapts to the member.
- **Free:** account, onboarding, exercise library with the body map, workout log, plans, support, and exactly **one free trial conversation** with the trainer (server-limited).
- **Subscribers:** ongoing coaching, personalised plans, and nutrition guidance when the plan includes it.

## Screens (order follows the approved app reference)
Tabs: Home · Workouts (body map, exercises, rest timer, workout log) · Nutrition (subscribers) · Trainer (the single AI chat) · Account.
Stack: recipe detail, credit wallet, plans & subscription, customer support (ticket form), trusted devices, trainer & privacy settings.
Auth: sign in / sign up, e-mail code, device verification.

## Rules the app keeps (enforced by the server, mirrored in the UI)
- Private screens open only on a **trusted device** (6-digit e-mail code); an account can be active on **two** trusted devices.
- Access to the trainer is decided by the server: trial conversation, then an active subscription.
- For subscribers every request shows its **exact credit cost** and needs a confirmation.
- Media is sent only after an explicit consent and the system permission; it is used for that one request and not stored.
  If the configured AI model cannot inspect a file, the trainer says so — it never guesses.
- The trainer answers fitness topics only and politely redirects anything else.

## Not done yet
Subscription checkout and automatic renewal (UPayments supports saved-card auto-deduct; not wired yet), real-time voice calls,
push notifications, App Store / Play builds (need an Expo account and store accounts). AI replies are mock until a provider key and budget are set.
