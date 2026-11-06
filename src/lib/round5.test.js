import { describe, it, expect } from 'vitest'
import { DEFAULT_PUSH_PREFS, normalizePushPrefs, pushNotificationsFor, weeklySummary } from './alerts.js'
import { predictTime, riegel, roundTarget } from './predict.js'
import { runPushJob } from './pushJob.js'
import { emptyRace, emptyResult } from './model.js'

let n = 0
const race = (o) => ({ ...emptyRace(), id: 'r' + ++n, name: 'Prova ' + n, ...o })
const res = (km, t, o = {}) => ({ ...emptyResult(), officialDistanceKm: km, netTime: t, ...o })

describe('preferências das notificações', () => {
  it('normaliza: ignora antecedências inválidas e completa com o padrão', () => {
    expect(normalizePushPrefs(null)).toEqual(normalizePushPrefs(DEFAULT_PUSH_PREFS))
    const p = normalizePushPrefs({ inscricao: [0, 7, 7, 99], kit: [], weekly: true, lixo: 1 })
    expect(p).toEqual({ inscricao: [7, 0], lote: [1], kit: [], prova: [1], weekly: true, orcamento: true })
  })
  it('respeita o que foi escolhido', () => {
    const today = '2026-11-04' // quarta
    const rs = [
      race({ id: 'a', status: 'aberta', name: 'Aberta', signupDeadline: '2026-11-11' }),
      race({ id: 'b', status: 'inscrita', name: 'Inscrita', date: '2026-11-04', startTime: '07:00', kitPickupDate: '2026-11-05' })
    ]
    expect(pushNotificationsFor(rs, today).map((x) => x.key)).toEqual(['b:kit:2026-11-05:1'])
    const out = pushNotificationsFor(rs, today, { inscricao: [7], prova: [0], kit: [] })
    expect(out.map((x) => x.key)).toEqual(['b:prova:2026-11-04:0', 'a:inscricao:2026-11-11:7'])
    expect(out[0].title).toBe('Hoje é dia de prova!')
    expect(out[0].url).toBe('/corridas/b/dia')
    expect(out[1].title).toBe('Inscrição termina em 7 dias')
  })
  it('resumo da semana só às segundas e só com algo marcado', () => {
    const rs = [
      race({ id: 'k', status: 'inscrita', name: 'Meia SP', date: '2026-11-15', kitPickupDate: '2026-11-13' }),
      race({ id: 'x', status: 'aberta', name: '10K', signupDeadline: '2026-11-09' })
    ]
    expect(weeklySummary(rs, '2026-11-10')).toBe(null) // terça
    const w = weeklySummary(rs, '2026-11-09') // segunda
    expect(w.key).toBe('semana:2026-11-09')
    expect(w.title).toBe('Sua semana: 3 compromissos')
    expect(w.body).toBe('hoje: fim da inscrição – 10K\nsex: kit – Meia SP\ndom: prova – Meia SP')
    expect(weeklySummary([], '2026-11-09')).toBe(null)
    expect(pushNotificationsFor(rs, '2026-11-09', { weekly: true })[0].type).toBe('semana')
    expect(pushNotificationsFor(rs, '2026-11-09', { weekly: false }).some((x) => x.type === 'semana')).toBe(false)
  })
  it('a rodada diária usa as preferências de cada pessoa e o padrão se a tabela não existir', async () => {
    const rs = [race({ id: 'p', status: 'inscrita', date: '2026-11-06' })]
    const subs = [{ endpoint: 'https://a', user_id: 'u1', tz: 'America/Sao_Paulo' }, { endpoint: 'https://b', user_id: 'u2', tz: 'America/Sao_Paulo' }]
    const sent = []
    const db = {
      subscriptions: async () => subs,
      races: async () => rs,
      prefs: async (u) => { if (u === 'u2') throw new Error('relation does not exist'); return { prova: [2] } },
      claim: async (u, keys) => keys,
      release: async () => {},
      removeSubscription: async () => {},
      cleanup: async () => {}
    }
    await runPushJob({ db, send: async (d, p) => sent.push(`${d.endpoint} ${p.tag}`), now: new Date('2026-11-04T11:00:00Z') })
    expect(sent).toEqual(['https://a p:prova:2026-11-06:2'])
  })
})

describe('previsão de tempo', () => {
  const today = '2026-11-04'
  it('Riegel e arredondamento', () => {
    expect(Math.round(riegel(3000, 10, 21.0975))).toBe(6619)
    expect(roundTarget(6619)).toBe(6600)
    expect(roundTarget(1799)).toBe(1785)
  })
  it('prefere distância próxima e recente, e o melhor resultado recente da faixa', () => {
    const rs = [
      race({ status: 'concluida', date: '2026-09-01', result: res(10, 3000) }),
      race({ status: 'concluida', date: '2026-05-01', result: res(10, 2950) }),
      race({ status: 'concluida', date: '2026-10-01', result: res(5, 1450) }),
      race({ status: 'concluida', date: '2023-01-01', result: res(21.1, 6000) }), // antiga demais
      race({ status: 'concluida', date: '2026-10-10', result: res(2, 500) }), // curta demais
      race({ status: 'concluida', date: '2026-10-20', result: res(10, 2500, { isOfficial: false }) }) // pessoal: ignorado havendo oficiais
    ]
    const p = predictTime(rs, 21.1, today)
    expect(p.quality).toBe('boa')
    expect(p.sources.map((s) => s.km)).toEqual([10, 10, 5])
    expect(p.estimate).toBe(Math.round(riegel(2950, 10, 21.1)))
    expect(p.high).toBe(Math.round(riegel(1450, 5, 21.1)))
  })
  it('mesma distância vem primeiro; extrapolação longa demais é recusada', () => {
    const rs = [race({ status: 'concluida', date: '2026-10-01', result: res(5, 1500) }), race({ status: 'concluida', date: '2026-01-01', result: res(10, 3200) })]
    expect(predictTime(rs, 10, today).quality).toBe('mesma')
    expect(predictTime(rs, 10, today).estimate).toBe(3200)
    expect(predictTime([rs[0]], 42.195, today)).toBe(null)
    expect(predictTime([], 10, today)).toBe(null)
    expect(predictTime(rs, 10, today, { excludeId: rs[1].id }).quality).toBe('boa')
  })
})
