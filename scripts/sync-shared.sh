#!/usr/bin/env bash
# Copies supabase/functions/_shared/upayments.ts into each payment function (each function is deployed with its own copy).
for f in initiate-payment payment-webhook payment-reconcile; do cp supabase/functions/_shared/upayments.ts supabase/functions/$f/upayments.ts; done
