// Buying VORA Coins or a subscription period. The price always comes from the server; the app only opens the hosted
// checkout page and afterwards ASKS THE SERVER whether the order was paid. The return page is never treated as proof.
//
// Store rules: Apple and Google require their own billing for digital goods inside store-distributed apps (outside a few
// regions). So checkout is offered on the web app, and inside native builds only when a build explicitly enables it
// (internal sandbox testing). A store build leaves EXPO_PUBLIC_NATIVE_CHECKOUT unset and shows no purchase button.
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import { Platform } from 'react-native'
import { fn } from './supabase'

export const checkoutAvailable = Platform.OS === 'web' || process.env.EXPO_PUBLIC_NATIVE_CHECKOUT === '1'
export type OrderKind = 'coins' | 'subscription'
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired'
const KEY = 'vora-pending-order'
const web = Platform.OS === 'web' && typeof window !== 'undefined'

/** Starts a checkout. On the web the page leaves for the hosted checkout; on native it opens in the browser. */
export async function startCheckout(kind: OrderKind, itemKey: string): Promise<{ orderId?: string; error?: string }> {
  const returnUrl = web ? window.location.origin + window.location.pathname + '#/store' : Linking.createURL('/store')
  const r = await fn<{ order_id: string; checkout_url: string }>('initiate-purchase', { kind, item_key: itemKey, idempotency_key: Crypto.randomUUID(), return_url: returnUrl })
  if (r.error || !r.data?.checkout_url) return { error: r.error ?? 'unavailable' }
  if (web) { try { window.sessionStorage.setItem(KEY, r.data.order_id) } catch { /* storage blocked */ } window.location.assign(r.data.checkout_url) }
  else await Linking.openURL(r.data.checkout_url)
  return { orderId: r.data.order_id }
}
/** The order a web checkout was started for in this tab (read once after returning). */
export function takePendingOrder(): string | null {
  if (!web) return null
  try { const v = window.sessionStorage.getItem(KEY); window.sessionStorage.removeItem(KEY); return v } catch { return null }
}
/** Server-side verification with the payment provider. */
export async function orderStatus(orderId: string): Promise<OrderStatus | null> {
  const r = await fn<{ status: OrderStatus }>('purchase-status', { order_id: orderId })
  return r.data?.status ?? null
}
