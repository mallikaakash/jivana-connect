import { createContext, useContext, type ReactNode } from 'react'
import type { CallStoryPhase } from './useCallStory'

const StoryContext = createContext<CallStoryPhase>('idle')

export function LandingStoryProvider({ phase, children }: { phase: CallStoryPhase; children: ReactNode }) {
  return <StoryContext.Provider value={phase}>{children}</StoryContext.Provider>
}

export function useLandingStory() {
  return useContext(StoryContext)
}

/** Shared demo patient — same names across hero, product, workflow. */
export const DEMO = {
  patient: 'Priya Nair',
  task: 'Confirm visit — 1 Nov',
  department: 'General OPD · Dr. Sharma',
  summary: 'Patient will attend the 1 Nov appointment. No reschedule requested.',
  nextAction: 'No action needed — task complete',
} as const
