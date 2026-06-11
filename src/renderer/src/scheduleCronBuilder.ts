export type ScheduleIntervalMode = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'custom'

export type SchedulePreset = 'workday' | 'daily' | 'hourly' | 'weekly'

export interface ScheduleCronState {
  mode: ScheduleIntervalMode
  minuteEvery: number
  minuteStart: number
  hourEvery: number
  hourMinute: number
  dailyTime: string
  weekdays: number[]
  weeklyTime: string
  monthDay: number
  monthlyTime: string
  customCron: string
}

export interface ScheduleCronResult {
  cron: string
  summary: string
}

export function defaultScheduleCronState(): ScheduleCronState {
  return {
    mode: 'weeks',
    minuteEvery: 15,
    minuteStart: 0,
    hourEvery: 2,
    hourMinute: 0,
    dailyTime: '09:00',
    weekdays: [1, 2, 3, 4, 5],
    weeklyTime: '09:00',
    monthDay: 1,
    monthlyTime: '09:00',
    customCron: '0 9 * * 1-5'
  }
}

export function scheduleCronStateFromPreset(preset: SchedulePreset): ScheduleCronState {
  const state = defaultScheduleCronState()
  switch (preset) {
    case 'workday':
      return { ...state, mode: 'weeks', weekdays: [1, 2, 3, 4, 5], weeklyTime: '09:00' }
    case 'daily':
      return { ...state, mode: 'days', dailyTime: '09:00' }
    case 'hourly':
      return { ...state, mode: 'hours', hourEvery: 2, hourMinute: 0 }
    case 'weekly':
      return { ...state, mode: 'weeks', weekdays: [1], weeklyTime: '09:00' }
  }
}

export function scheduleCronStateFromCron(cron: string | undefined): ScheduleCronState {
  const state = defaultScheduleCronState()
  const expression = cron?.trim()
  if (!expression) return state

  const parts = expression.split(/\s+/)
  if (parts.length !== 5) return { ...state, mode: 'custom', customCron: expression }

  const [minuteRaw, hourRaw, dayOfMonthRaw, monthRaw, dayOfWeekRaw] = parts
  const minute = Number(minuteRaw)
  const hour = Number(hourRaw)
  if (isNumberText(minuteRaw) && hourRaw.startsWith('*/') && dayOfMonthRaw === '*' && monthRaw === '*' && dayOfWeekRaw === '*') {
    const every = Number(hourRaw.slice(2))
    if (Number.isInteger(every) && every > 0) {
      return { ...state, mode: 'hours', hourEvery: every, hourMinute: minute }
    }
  }

  if (dayOfMonthRaw === '*' && monthRaw === '*' && dayOfWeekRaw === '*' && isNumberText(minuteRaw) && isNumberText(hourRaw)) {
    return { ...state, mode: 'days', dailyTime: formatTime(hour, minute) }
  }

  if (dayOfMonthRaw === '*' && monthRaw === '*' && dayOfWeekRaw !== '*' && isNumberText(minuteRaw) && isNumberText(hourRaw)) {
    return {
      ...state,
      mode: 'weeks',
      weeklyTime: formatTime(hour, minute),
      weekdays: parseDayOfWeekList(dayOfWeekRaw)
    }
  }

  if (monthRaw === '*' && dayOfWeekRaw === '*' && isNumberText(minuteRaw) && isNumberText(hourRaw) && isNumberText(dayOfMonthRaw)) {
    return {
      ...state,
      mode: 'months',
      monthDay: Number(dayOfMonthRaw),
      monthlyTime: formatTime(hour, minute)
    }
  }

  if (hourRaw === '*' && dayOfMonthRaw === '*' && monthRaw === '*' && dayOfWeekRaw === '*') {
    const minutes = parseMinuteList(minuteRaw)
    if (minutes.length >= 2) {
      const step = minutes[1] - minutes[0]
      if (step > 0 && minutes.every((value, index) => index === 0 || value - minutes[index - 1] === step)) {
        return { ...state, mode: 'minutes', minuteEvery: step, minuteStart: minutes[0] }
      }
    }
  }

  return { ...state, mode: 'custom', customCron: expression }
}

export function buildScheduleCron(state: ScheduleCronState): ScheduleCronResult {
  switch (state.mode) {
    case 'minutes':
      return {
        cron: `${buildMinuteField(state.minuteStart, state.minuteEvery)} * * * *`,
        summary: `每 ${state.minuteEvery} 分钟`
      }
    case 'hours':
      return {
        cron: `${state.hourMinute} */${state.hourEvery} * * *`,
        summary: `每 ${state.hourEvery} 小时第 ${formatTwoDigits(state.hourMinute)} 分钟`
      }
    case 'days': {
      const { hour, minute } = parseTime(state.dailyTime)
      return {
        cron: `${minute} ${hour} * * *`,
        summary: `每天 ${formatTime(hour, minute)}`
      }
    }
    case 'weeks': {
      const { hour, minute } = parseTime(state.weeklyTime)
      const weekdays = normalizeWeekdays(state.weekdays)
      return {
        cron: `${minute} ${hour} * * ${weekdays.join(',')}`,
        summary: describeWeekdays(weekdays, formatTime(hour, minute))
      }
    }
    case 'months': {
      const { hour, minute } = parseTime(state.monthlyTime)
      const monthDay = clamp(Math.round(state.monthDay), 1, 31)
      return {
        cron: `${minute} ${hour} ${monthDay} * *`,
        summary: `每月 ${monthDay} 日 ${formatTime(hour, minute)}`
      }
    }
    case 'custom':
      return {
        cron: state.customCron.trim(),
        summary: '自定义 Cron'
      }
  }
}

export function normalizeWeekdays(days: number[]): number[] {
  const unique = [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
  return unique.length > 0 ? unique.sort((a, b) => a - b) : [1]
}

function buildMinuteField(start: number, every: number): string {
  const safeStart = clamp(Math.round(start), 0, 59)
  const safeEvery = clamp(Math.round(every), 1, 59)
  if (safeStart === 0) return `*/${safeEvery}`
  return minuteList(safeStart, safeEvery).join(',')
}

function minuteList(start: number, step: number): number[] {
  const values: number[] = []
  for (let minute = start; minute <= 59; minute += step) values.push(minute)
  return values
}

function parseMinuteList(raw: string): number[] {
  if (raw.startsWith('*/')) {
    const step = Number(raw.slice(2))
    if (!Number.isInteger(step) || step <= 0) return []
    return minuteList(0, step)
  }
  const parts = raw.split(',').map((item) => Number(item.trim()))
  return parts.every((item) => Number.isInteger(item) && item >= 0 && item <= 59) ? parts : []
}

function parseDayOfWeekList(raw: string): number[] {
  if (raw === '1-5') return [1, 2, 3, 4, 5]
  const parts = raw.split(',').map((item) => Number(item.trim()))
  return normalizeWeekdays(parts)
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] = value.split(':')
  return {
    hour: clamp(Number(hourRaw), 0, 23),
    minute: clamp(Number(minuteRaw), 0, 59)
  }
}

function describeWeekdays(days: number[], time: string): string {
  const joined = days.join(',')
  if (joined === '1,2,3,4,5') return `工作日 ${time}`
  if (joined === '0,1,2,3,4,5,6') return `每天 ${time}`
  if (days.length === 1) return `每周${weekdayName(days[0])} ${time}`
  return `每周${days.map(weekdayName).join('、')} ${time}`
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

function formatTime(hour: number, minute: number): string {
  return `${formatTwoDigits(hour)}:${formatTwoDigits(minute)}`
}

function formatTwoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function isNumberText(value: string): boolean {
  return /^\d+$/.test(value)
}
