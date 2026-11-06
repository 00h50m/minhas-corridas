import { describe, it, expect } from 'vitest'
import { ageCategory, ageOn, callName, greeting, initials, isBirthday, normalizeProfile, profileCompleteness, validateProfile } from './profile.js'
import { buildBackup, parseBackup } from '../services/backup.js'

describe('perfil', () => {
  it('normaliza: só campos conhecidos, valores válidos e textos aparados', () => {
    const p = normalizeProfile({ name: '  Giovanna Pupo  ', sex: 'X', state: 'ZZ', bloodType: 'C+', birthDate: '2026-02-30', showNameOnCard: undefined, hacker: 1 })
    expect(p).toMatchObject({ name: 'Giovanna Pupo', sex: '', state: '', bloodType: '', birthDate: null, showNameOnCard: true })
    expect('hacker' in p).toBe(false)
    expect(normalizeProfile(null).name).toBe('')
  })
  it('nome para chamar, iniciais e saudação (com aniversário)', () => {
    const p = normalizeProfile({ name: 'Giovanna Pupo', birthDate: '1990-11-06' })
    expect(callName(p)).toBe('Giovanna')
    expect(callName({ ...p, nickname: 'Gi' })).toBe('Gi')
    expect(initials(p)).toBe('GP')
    expect(greeting(p, new Date(2026, 10, 7, 9), '2026-11-07')).toBe('Bom dia, Giovanna')
    expect(greeting(p, new Date(2026, 10, 7, 15), '2026-11-07')).toBe('Boa tarde, Giovanna')
    expect(greeting(normalizeProfile(null), new Date(2026, 10, 7, 21), '2026-11-07')).toBe('Boa noite')
    expect(isBirthday(p, '2026-11-06')).toBe(true)
    expect(greeting(p, new Date(2026, 10, 6, 9), '2026-11-06')).toBe('Feliz aniversário, Giovanna! 🎉')
  })
  it('idade e faixa etária pela idade em 31/12 do ano da prova', () => {
    expect(ageOn('1990-11-06', '2026-11-05')).toBe(35)
    expect(ageOn('1990-11-06', '2026-11-06')).toBe(36)
    const p = normalizeProfile({ birthDate: '1990-11-06', sex: 'F' })
    expect(ageCategory(p, '2026-03-01')).toEqual({ age: 36, band: '35-39', label: 'F 35-39' })
    expect(ageCategory(p, '2030-03-01').label).toBe('F 40-44')
    expect(ageCategory({ ...p, sex: '' }, '2026-03-01').label).toBe('35-39')
    expect(ageCategory({ birthDate: '2010-01-01' }, '2026-05-01').band).toBe('até 19')
    expect(ageCategory({ birthDate: '1950-01-01' }, '2026-05-01').band).toBe('70+')
    expect(ageCategory(p, null)).toBe(null)
    expect(ageCategory(normalizeProfile(null), '2026-01-01')).toBe(null)
  })
  it('validação e quanto falta preencher', () => {
    expect(validateProfile({ birthDate: '2030-01-01' }, '2026-11-06').birthDate).toBeTruthy()
    expect(validateProfile({ emergencyPhone: 'abc' }, '2026-11-06').emergencyPhone).toBeTruthy()
    expect(validateProfile({ emergencyPhone: '(11) 99999-0000' }, '2026-11-06')).toEqual({})
    expect(profileCompleteness(normalizeProfile({ name: 'A', shirtSize: 'M' }), true)).toBe(0.6)
  })
  it('backup leva e traz o perfil', async () => {
    const json = await buildBackup([], [], null, { data: normalizeProfile({ name: 'Ana', shirtSize: 'P' }), avatar: 'data:image/jpeg;base64,AAAA', updatedAt: '2026-11-01T00:00:00Z' })
    const back = parseBackup(json)
    expect(back.profile.data).toMatchObject({ name: 'Ana', shirtSize: 'P' })
    expect(back.profile.avatar).toBe('data:image/jpeg;base64,AAAA')
    expect(parseBackup(await buildBackup([], [])).profile).toBe(null)
    const evil = JSON.parse(json)
    evil.profile.avatar = 'javascript:alert(1)'
    expect(parseBackup(JSON.stringify(evil)).profile.avatar).toBe(null)
  })
})
