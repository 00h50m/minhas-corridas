import { describe, it, expect } from 'vitest'
import { companionNames, normalizePeople, phoneForWhatsapp, pickupMessage, pickups, whatsappLink } from './people.js'
import { normalizeProfile } from './profile.js'
import { buildSchedule } from './schedule.js'
import { normalizeLogistics } from './logistics.js'
import { yearReview } from './yearReview.js'
import { emptyRace, emptyResult, normalizeRace } from './model.js'

describe('pessoas e lugares', () => {
  it('perfil guarda pessoas (só nome obrigatório) e lugares com tempo de parada', () => {
    const p = normalizeProfile({
      favorites: [{ id: 'casa-ana', label: 'Casa da Ana', address: 'Rua X, 10, Jundiaí', dwellMin: 3 }, { id: 'posto', label: 'Posto', address: 'Av. Y, 200', dwellMin: '' }],
      people: [{ id: 'ana', name: '  Ana Souza ', phone: '(11) 98888-7777', placeId: 'casa-ana' }, { id: 'bia', name: 'Bia', placeId: 'nao-existe' }, { name: '' }]
    })
    expect(p.favorites.map((f) => [f.id, f.dwellMin])).toEqual([['casa-ana', 3], ['posto', null]])
    expect(p.people).toEqual([
      { id: 'ana', name: 'Ana Souza', phone: '(11) 98888-7777', placeId: 'casa-ana' },
      { id: 'bia', name: 'Bia', phone: '', placeId: null } // lugar removido → sem endereço
    ])
    expect(normalizePeople(Array.from({ length: 40 }, (_, i) => ({ name: 'P' + i }))).length).toBe(30)
  })
  it('telefone para WhatsApp (com 55) e link com a mensagem', () => {
    expect(phoneForWhatsapp('(11) 98888-7777')).toBe('5511988887777')
    expect(phoneForWhatsapp('011 3333-4444')).toBe('551133334444')
    expect(phoneForWhatsapp('+55 11 98888-7777')).toBe('5511988887777')
    expect(phoneForWhatsapp('123')).toBe(null)
    expect(whatsappLink('', 'oi')).toBe('https://wa.me/?text=oi')
    expect(whatsappLink('11988887777', 'Oi Ana')).toBe('https://wa.me/5511988887777?text=Oi%20Ana')
  })
  it('horário de cada busca vem da agenda; mensagem pronta', () => {
    const stops = [{ label: 'Buscar Ana', dwellMin: 5, personId: 'ana' }, { label: 'Posto', dwellMin: 5 }]
    const s = buildSchedule({ startTime: '07:00', prep: { arriveBeforeMin: 45, showerMin: 15, dressMin: 15, finalPrepMin: 10, parkingMin: 10, bufferMin: 10, warmupMin: 15, positioningMin: 10 }, legs: [{ durationMin: 12 }, { durationMin: 15 }, { durationMin: 29 }], stops })
    const people = [{ id: 'ana', name: 'Ana Souza', phone: '11988887777' }]
    const list = pickups(s, stops, people)
    expect(list).toHaveLength(1)
    expect(list[0].at).toBe(s.depart + 12)
    const race = { name: 'Corrida em Itatiba', date: '2026-11-08', startTime: '07:00' }
    expect(pickupMessage({ person: people[0], race, at: 301 })).toBe('Oi, Ana! Passo aí às 05:01 para a Corrida em Itatiba (08/11). Largada às 07:00. 🏃')
  })
  it('paradas lembram quem é buscado; provas guardam quem vai junto', () => {
    const l = normalizeLogistics({ outbound: { stops: [{ address: 'Rua X, 10', personId: 'ana', dwellMin: 3 }] } })
    expect(l.outbound.stops[0]).toMatchObject({ personId: 'ana', dwellMin: 3 })
    const r = normalizeRace({ ...emptyRace(), id: 'x', name: 'X', companionIds: ['ana', 'ana', 5, 'bia'], companions: 'Primo' })
    expect(r.companionIds).toEqual(['ana', 'bia'])
    expect(companionNames(r, [{ id: 'ana', name: 'Ana' }])).toEqual(['Ana', 'Primo'])
    expect(normalizeRace({ ...emptyRace(), id: 'y', name: 'Antiga' }).companionIds).toEqual([])
  })
  it('retrospectiva: com quem correu', () => {
    const done = (id, date, ids) => normalizeRace({ ...emptyRace(), id, name: id, status: 'concluida', date, companionIds: ids, result: { ...emptyResult(), officialDistanceKm: 10, netTime: 3000 } })
    const races = [done('a', '2026-03-01', ['ana']), done('b', '2026-05-01', ['ana', 'bia']), done('c', '2025-05-01', ['bia'])]
    const rv = yearReview(races, [], 2026, '2026-12-05', [{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }])
    expect(rv.companions).toEqual([{ id: 'ana', name: 'Ana', count: 2 }, { id: 'bia', name: 'Bia', count: 1 }])
  })
})
