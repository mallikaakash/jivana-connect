import { useEffect, useState } from 'react'

export type CallStoryPhase = 'idle' | 'live' | 'summary' | 'resolved'

const ORDER: CallStoryPhase[] = ['idle', 'live', 'summary', 'resolved']

export function useCallStory(enabled = true) {
  const [phase, setPhase] = useState<CallStoryPhase>('idle')

  useEffect(() => {
    if (!enabled) {
      setPhase('resolved')
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('resolved')
      return
    }
    let i = 0
    setPhase(ORDER[i]!)
    const id = window.setInterval(() => {
      i = (i + 1) % ORDER.length
      setPhase(ORDER[i]!)
    }, 4200)
    return () => window.clearInterval(id)
  }, [enabled])

  return phase
}
