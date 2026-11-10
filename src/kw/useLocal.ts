import { useCallback, useState } from 'react'

/**
 * localStorage-backed state. Food diary data deliberately stays on this device
 * (keys kept from the original Gym-Tracker KW app so existing data still shows up).
 * The setter returns false when the browser refuses to store the value.
 */
export function useLocal<T>(key: string, initial: T): [T, (update: (old: T) => T) => boolean] {
  const read = (): T => {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as T) : initial
    } catch {
      return initial
    }
  }
  const [value, setValue] = useState<T>(read)
  const update = useCallback((fn: (old: T) => T) => {
    let current: T
    try {
      const v = localStorage.getItem(key)
      current = v ? (JSON.parse(v) as T) : initial
    } catch {
      current = initial
    }
    const next = fn(current)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      window.alert('تعذر حفظ البيانات على هذا الجهاز. تحقق من إعدادات التخزين.')
      return false
    }
    setValue(next)
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return [value, update]
}
