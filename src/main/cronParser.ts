export interface CronFields {
  minute: number[]
  hour: number[]
  dayOfMonth: number[]
  month: number[]
  dayOfWeek: number[]
}

interface FieldSpec {
  name: keyof CronFields
  min: number
  max: number
}

const FIELD_SPECS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'dayOfWeek', min: 0, max: 7 }
]

const ALL_DAYS_OF_MONTH = range(1, 31)
const ALL_MONTHS = range(1, 12)
const ALL_DAYS_OF_WEEK = range(0, 6)

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error('Cron expression must contain exactly 5 fields')
  }

  const fields = FIELD_SPECS.reduce((acc, spec, index) => {
    acc[spec.name] = parseField(parts[index], spec)
    return acc
  }, {} as CronFields)

  if (isEveryMinute(fields)) {
    throw new Error('Cron expression is too frequent')
  }

  return fields
}

export function nextFireTime(expression: string, after: Date = new Date()): Date {
  const fields = parseCron(expression)
  const cursor = new Date(after.getTime())
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  const maxChecks = 60 * 24 * 366 * 5
  for (let checked = 0; checked < maxChecks; checked++) {
    if (matches(fields, cursor)) return new Date(cursor.getTime())
    cursor.setMinutes(cursor.getMinutes() + 1)
  }

  throw new Error('Could not find a matching cron time within 5 years')
}

export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression)
    return true
  } catch {
    return false
  }
}

export function describeCron(expression: string): string {
  const fields = parseCron(expression)
  const minutes = fields.minute
  const hours = fields.hour
  const domAll = sameValues(fields.dayOfMonth, ALL_DAYS_OF_MONTH)
  const monthAll = sameValues(fields.month, ALL_MONTHS)
  const dowAll = sameValues(fields.dayOfWeek, ALL_DAYS_OF_WEEK)

  if (
    monthAll &&
    domAll &&
    dowAll &&
    hours.length === 24 &&
    minutes.length > 1 &&
    isRegularStep(minutes)
  ) {
    return `每 ${minutes[1] - minutes[0]} 分钟`
  }

  if (monthAll && domAll && minutes.length === 1 && hours.length >= 1) {
    const timeText = hours.map((hour) => formatTime(hour, minutes[0])).join(', ')
    if (sameValues(fields.dayOfWeek, [1, 2, 3, 4, 5])) return `工作日 ${timeText}`
    if (dowAll) return `每天 ${timeText}`
    if (fields.dayOfWeek.length === 1) return `每周${weekdayName(fields.dayOfWeek[0])} ${timeText}`
  }

  if (monthAll && minutes.length === 1 && hours.length === 1 && fields.dayOfMonth.length === 1 && dowAll) {
    return `每月 ${fields.dayOfMonth[0]} 日 ${formatTime(hours[0], minutes[0])}`
  }

  return `Cron: ${expression.trim()}`
}

function parseField(raw: string, spec: FieldSpec): number[] {
  if (!raw) throw new Error(`Missing ${spec.name} field`)

  const values = new Set<number>()
  for (const segment of raw.split(',')) {
    if (!segment) throw new Error(`Invalid ${spec.name} list`)
    for (const value of parseSegment(segment, spec)) values.add(normalizeValue(value, spec))
  }

  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) throw new Error(`Empty ${spec.name} field`)
  return sorted
}

function parseSegment(segment: string, spec: FieldSpec): number[] {
  const [base, stepRaw] = segment.split('/')
  if (segment.split('/').length > 2) throw new Error(`Invalid ${spec.name} step`)

  const step = stepRaw === undefined ? 1 : parseNumber(stepRaw, spec)
  if (step <= 0) throw new Error(`Invalid ${spec.name} step`)

  let start: number
  let end: number
  if (base === '*') {
    start = spec.min
    end = spec.max
  } else if (base.includes('-')) {
    const [startRaw, endRaw] = base.split('-')
    if (!startRaw || !endRaw || base.split('-').length !== 2) {
      throw new Error(`Invalid ${spec.name} range`)
    }
    start = parseNumber(startRaw, spec)
    end = parseNumber(endRaw, spec)
    if (start > end) throw new Error(`Invalid ${spec.name} range`)
  } else {
    const value = parseNumber(base, spec)
    start = value
    end = value
  }

  assertInRange(start, spec)
  assertInRange(end, spec)

  const values: number[] = []
  for (let value = start; value <= end; value += step) values.push(value)
  return values
}

function parseNumber(raw: string, spec: FieldSpec): number {
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${spec.name} number`)
  const value = Number(raw)
  assertInRange(value, spec)
  return value
}

function assertInRange(value: number, spec: FieldSpec): void {
  if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
    throw new Error(`${spec.name} value out of range`)
  }
}

function normalizeValue(value: number, spec: FieldSpec): number {
  if (spec.name === 'dayOfWeek' && value === 7) return 0
  return value
}

function matches(fields: CronFields, date: Date): boolean {
  return (
    fields.minute.includes(date.getMinutes()) &&
    fields.hour.includes(date.getHours()) &&
    fields.dayOfMonth.includes(date.getDate()) &&
    fields.month.includes(date.getMonth() + 1) &&
    fields.dayOfWeek.includes(date.getDay())
  )
}

function isEveryMinute(fields: CronFields): boolean {
  return (
    fields.minute.length === 60 &&
    fields.hour.length === 24 &&
    fields.dayOfMonth.length === 31 &&
    fields.month.length === 12 &&
    fields.dayOfWeek.length === 7
  )
}

function sameValues(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function isRegularStep(values: number[]): boolean {
  if (values.length < 2) return false
  const step = values[1] - values[0]
  return step > 0 && values.every((value, index) => index === 0 || value - values[index - 1] === step)
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function weekdayName(day: number): string {
  switch (day) {
    case 0: return '日'
    case 1: return '一'
    case 2: return '二'
    case 3: return '三'
    case 4: return '四'
    case 5: return '五'
    case 6: return '六'
    default: return String(day)
  }
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}
