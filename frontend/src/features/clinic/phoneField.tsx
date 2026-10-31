/** Build/store E.164 (+country + number, no spaces). UI uses country + local for clarity. */

const COUNTRY_OPTIONS = [
  { dial: '+91', label: 'India (+91)' },
  { dial: '+1', label: 'US / Canada (+1)' },
  { dial: '+44', label: 'UK (+44)' },
  { dial: '+971', label: 'UAE (+971)' },
] as const

export function stripToE164(raw: string): string {
  let s = raw.trim().replace(/[\s\-().]/g, '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (!s.startsWith('+') && s.length > 0) s = `+${s}`
  return s
}

export function composeE164(countryDial: string, localDigits: string): string {
  const dial = countryDial.startsWith('+') ? countryDial : `+${countryDial}`
  const local = localDigits.replace(/\D/g, '')
  return `${dial}${local}`
}

export function splitE164(e164: string): { countryDial: string; local: string } {
  const normalized = stripToE164(e164)
  if (!normalized.startsWith('+')) return { countryDial: '+91', local: normalized.replace(/\D/g, '') }
  const known = [...COUNTRY_OPTIONS].map((c) => c.dial).sort((a, b) => b.length - a.length)
  for (const dial of known) {
    if (normalized.startsWith(dial)) {
      return { countryDial: dial, local: normalized.slice(dial.length).replace(/\D/g, '') }
    }
  }
  const m = normalized.match(/^(\+\d{1,3})(\d+)$/)
  if (m) return { countryDial: m[1], local: m[2] }
  return { countryDial: '+91', local: normalized.replace(/\D/g, '') }
}

export { COUNTRY_OPTIONS }

type PhoneFieldsProps = {
  countryDial: string
  localNumber: string
  onCountryDial: (v: string) => void
  onLocalNumber: (v: string) => void
  id?: string
  /** Shown when empty; avoid real/demo numbers so browsers don’t treat it as autofill. */
  localPlaceholder?: string
  autoComplete?: string
}

export function PhoneMobileFields({
  countryDial,
  localNumber,
  onCountryDial,
  onLocalNumber,
  id,
  localPlaceholder = '10-digit mobile',
  autoComplete = 'tel-national',
}: PhoneFieldsProps) {
  return (
    <div className="mt-1">
      <div className="flex gap-2">
        <select
          aria-label="Country code"
          className="w-[9.5rem] shrink-0 rounded-lg border border-slate-200 py-2 pl-2.5 text-sm"
          value={countryDial}
          onChange={(e) => onCountryDial(e.target.value)}
        >
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.dial} value={c.dial}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          required
          inputMode="numeric"
          autoComplete={autoComplete}
          placeholder={localPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
          value={localNumber}
          onChange={(e) => onLocalNumber(e.target.value.replace(/[^\d\s]/g, ''))}
        />
      </div>
    </div>
  )
}
