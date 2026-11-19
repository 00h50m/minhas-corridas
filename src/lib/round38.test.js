// Rodada 38: lembretes de treino à noite (“fez o treino?” com botões e a semana no domingo) e os
// primeiros passos do app.
import { describe, expect, it } from 'vitest'
import { eveningPushes, workoutPushes } from './workoutPush.js'
import { normalizePushPrefs } from './alerts.js'
import { runPushJob } from './pushJob.js'
import { firstSteps } from '../components/FirstSteps.jsx'

const step = (min) => [{ kind: 'step', type: 'corrida', duration: { kind: 'time', value: min * 60 }, target: { kind: 'none' } }]
const W = (id, date, status, extra = {}) => ({ id, name: id, date, status, items: step(30), sport: 'corrida', ...extra })

describe('lembrete da noite', () => {
  it('treino de hoje ainda planejado: “Fez o treino de hoje?” com Fiz e Remanejar', () => {
    const out = eveningPushes([W('Tiros', '2026-11-18', 'planejado'), W('Ontem', '2026-11-17', 'feito')], '2026-11-18')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      key: 'treino-passou:Tiros:2026-11-18',
      url: '/treinos/Tiros',
      title: 'Fez o treino de hoje?',
      body: '“Tiros” ainda está como planejado. Marque como feito, “não fiz” ou remaneje.',
      actions: [{ action: 'feito', title: 'Fiz', url: '/treinos/Tiros?marcar=feito' }, { action: 'remanejar', title: 'Remanejar', url: '/treinos/Tiros?remanejar=1' }]
    })
  })
  it('dois treinos: um aviso só, sem botões; feito ou sem treino: nada', () => {
    const two = eveningPushes([W('A', '2026-11-18', 'planejado'), W('B', '2026-11-18', 'planejado')], '2026-11-18')
    expect(two[0]).toMatchObject({ title: 'Fez os 2 treinos de hoje?', url: '/treinos', actions: [] })
    expect(eveningPushes([W('A', '2026-11-18', 'feito')], '2026-11-18')).toEqual([])
    expect(eveningPushes([W('A', '2026-11-18', 'planejado')], '2026-11-18', normalizePushPrefs({ noite: false }))).toEqual([])
    expect(eveningPushes([W('A', '2026-11-18', 'planejado')], '2026-11-18', normalizePushPrefs({ treino: false }))).toEqual([])
  })
  it('mesma chave do “ficou sem marcar” da manhã seguinte: só um dos dois chega', () => {
    const ws = [W('Tiros', '2026-11-18', 'planejado')]
    const night = eveningPushes(ws, '2026-11-18')[0].key
    const morning = workoutPushes(ws, [], '2026-11-19', { treino: true, reta: false }).find((n) => n.key.startsWith('treino-passou'))
    expect(morning.key).toBe(night)
  })
  it('domingo à noite: como foi a semana, com o atalho para o story', () => {
    const ws = [W('a', '2026-11-16', 'feito', { result: { distanceKm: 5, elapsedSec: 1800 } }), W('b', '2026-11-19', 'feito', { result: { distanceKm: 6, elapsedSec: 2100 } })]
    const out = eveningPushes(ws, '2026-11-22')
    expect(out).toEqual([expect.objectContaining({ key: 'treinos-semana:2026-11-16', url: '/stories?modelo=semana&semana=2026-11-16', title: 'Semana fechada: 2 de 2 treinos' })])
    expect(eveningPushes(ws, '2026-11-21')).toEqual([]) // sábado: não
  })
  it('a rodada da noite só manda os avisos da noite, com os botões no envio', async () => {
    const sent = []
    const db = {
      subscriptions: async () => [{ endpoint: 'e1', user_id: 'u1', p256dh: 'p', auth: 'a', tz: 'America/Sao_Paulo' }],
      races: async () => [{ id: 'r', name: 'Prova', date: '2026-11-19', status: 'inscrita' }],
      prefs: async () => null,
      workouts: async () => [W('Tiros', '2026-11-18', 'planejado')],
      claim: async (u, keys) => keys,
      release: async () => {},
      removeSubscription: async () => {},
      cleanup: async () => {}
    }
    const r = await runPushJob({ db, send: async (d, p) => sent.push(p), now: new Date('2026-11-18T23:00:00Z'), slot: 'noite' })
    expect(r.notifications).toBe(1)
    expect(sent[0]).toMatchObject({ title: 'Fez o treino de hoje?', url: '/treinos/Tiros', actions: [{ action: 'feito' }, { action: 'remanejar' }] })
    sent.length = 0
    await runPushJob({ db, send: async (d, p) => sent.push(p), now: new Date('2026-11-18T11:00:00Z') })
    expect(sent.some((p) => p.title === 'Fez o treino de hoje?')).toBe(false)
    expect(sent.some((p) => p.title.startsWith('Treino de hoje'))).toBe(true)
  })
})

describe('primeiros passos', () => {
  it('marca sozinho o que já foi feito', () => {
    const none = firstSteps({})
    expect(none.map((s) => [s.id, s.done])).toEqual([['prova', false], ['treino', false], ['relogio', false], ['perfil', false]])
    const some = firstSteps({ races: [{ id: 'r' }], workouts: [{ id: 'w', result: { distanceKm: 5 } }], profile: { nickname: 'Gi' } })
    expect(some.every((s) => s.done)).toBe(true)
    expect(firstSteps({ workouts: [{ id: 'w', result: null }], garminKey: true }).find((s) => s.id === 'relogio').done).toBe(true)
  })
})
