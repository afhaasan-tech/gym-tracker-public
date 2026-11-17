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

## Screens (order follows the approved app reference)
Tabs: Home · Workouts (body map, exercises, rest timer, workout log) · Nutrition (recipes) · Coach (3 AI agents) · Account.
Stack: recipe detail, credit wallet, plans, trusted devices, coach & privacy settings. Auth: sign in / sign up, e-mail code, device verification.

## Rules the app keeps (enforced by the server, mirrored in the UI)
- Private screens open only on a **trusted device** (6-digit e-mail code); an account can be active on **two** trusted devices.
- Every paid AI request shows its **exact credit cost** and needs a confirmation; support chat is free.
- Plans are display-only; checkout and subscriptions are not enabled.

## Not done yet
Voice input (microphone), push notifications, subscription checkout, App Store / Play builds (need an Expo account and store accounts).
