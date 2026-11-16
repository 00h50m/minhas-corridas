// Carona compartilhada: o que entra, quem divide, parte de cada um e mensagem.
import { describe, expect, it } from 'vitest'
import { carpool, carpoolMessage, defaultSplitIds, normalizeLogistics } from './logistics.js'

const people = [{ id: 'p1', name: 'Dani Souza', phone: '(11) 98888-7777' }, { id: 'p2', name: 'Ana', phone: '' }, { id: 'p3', name: 'Bia', phone: '' }]
const race = { id: 'hc', name: 'Health Care Run', venueAddress: 'PAC', companionIds: ['p2'] }
const log = (split) => normalizeLogistics({
  origin: { label: 'Casa', address: 'Casa' },
  outbound: { stops: [{ id: 's1', label: 'Buscar Dani', address: 'Rua Dani', personId: 'p1', dwellMin: 5 }] },
  costs: { fuelOut: { est: 30 }, fuelBack: { est: 30 }, tollsOut: { est: 9.8 }, parking: { paid: 15 }, kitFuel: { est: 20 } },
  split
})

describe('carona compartilhada', () => {
  it('sem divisão salva: quem é buscado na ida e quem vai junto já entram; o kit fica de fora', () => {
    const l = log(undefined)
    expect(defaultSplitIds(race, l)).toEqual(['p1', 'p2'])
    const c = carpool(race, l, people)
    expect(c.total).toBe(84.8) // 30 + 9,8 + 30 + 15 (o combustível do kit não entra)
    expect(c.count).toBe(3) // Dani, Ana e você
    expect(c.share).toBe(28.27)
    expect(c.items.map((i) => i.label)).not.toContain('Combustível (kit)')
  })
  it('pessoas sem cadastro, sem você, e mensagem com Pix', () => {
    const c = carpool(race, log({ personIds: ['p1'], others: 2, includeMe: false, pix: 'gi@exemplo.com' }), people)
    expect(c.count).toBe(3)
    expect(c.share).toBe(28.27)
    const msg = carpoolMessage({ person: people[0], race, c })
    expect(msg).toContain('Oi, Dani! O deslocamento da Health Care Run (')
    expect(msg).toContain('deu R$ 84,80. Dividindo por 3, a sua parte fica R$ 28,27. Pix: gi@exemplo.com')
  })
})
