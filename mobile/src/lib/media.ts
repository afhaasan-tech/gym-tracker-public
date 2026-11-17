// Media the member chooses to send to the trainer: one photo, one short video or one voice message per request.
// Nothing is read without an explicit tap, and files are sent to the server for that one request only (not stored).
import * as ImagePicker from 'expo-image-picker'

export type MediaKind = 'image' | 'audio' | 'video'
export type Attachment = { kind: MediaKind; mime_type: string; data_base64: string; bytes: number; name: string }
// server-side caps (decoded bytes) — mirrored here so the member gets a clear message before uploading
export const LIMIT: Record<MediaKind, number> = { image: 4 * 1024 * 1024, audio: 5 * 1024 * 1024, video: 12 * 1024 * 1024 }
const IMAGE = ['image/jpeg', 'image/png', 'image/webp'], VIDEO = ['video/mp4', 'video/quicktime', 'video/webm']

export class MediaError extends Error { constructor(public code: 'permission' | 'too_large' | 'type' | 'read') { super(code) } }

export async function uriToBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob()
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new MediaError('read'))
    fr.onloadend = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)) }
    fr.readAsDataURL(blob)
  })
}
const sizeOf = (b64: string) => Math.floor((b64.length * 3) / 4)

/** Opens the system picker for ONE photo or ONE video. Returns null if the member cancels. */
export async function pickMedia(kind: 'image' | 'video'): Promise<Attachment | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new MediaError('permission')
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kind === 'image' ? ['images'] : ['videos'], allowsMultipleSelection: false, quality: 0.6, base64: kind === 'image', videoMaxDuration: 30 })
  if (res.canceled || !res.assets?.[0]) return null
  const a = res.assets[0]
  let mime = (a.mimeType ?? '').toLowerCase()
  if (!mime) mime = kind === 'image' ? 'image/jpeg' : 'video/mp4'
  if (kind === 'image' && !IMAGE.includes(mime)) mime = a.base64 ? 'image/jpeg' : mime     // the picker re-encodes to JPEG when base64 is requested
  if (!(kind === 'image' ? IMAGE : VIDEO).includes(mime)) throw new MediaError('type')
  if (typeof a.fileSize === 'number' && a.fileSize > LIMIT[kind] && kind === 'video') throw new MediaError('too_large')
  let data: string
  try { data = a.base64 ?? await uriToBase64(a.uri) } catch { throw new MediaError('read') }
  if (data.startsWith('data:')) data = data.slice(data.indexOf(',') + 1)
  const bytes = sizeOf(data)
  if (bytes > LIMIT[kind]) throw new MediaError('too_large')
  return { kind, mime_type: mime, data_base64: data, bytes, name: a.fileName ?? (kind === 'image' ? 'photo' : 'video') }
}

/** Turns a finished voice recording (file/blob URI) into an attachment. */
export async function audioAttachment(uri: string, mimeHint: string): Promise<Attachment> {
  let data: string
  try { data = await uriToBase64(uri) } catch { throw new MediaError('read') }
  const bytes = sizeOf(data)
  if (bytes > LIMIT.audio) throw new MediaError('too_large')
  return { kind: 'audio', mime_type: mimeHint, data_base64: data, bytes, name: 'voice' }
}
