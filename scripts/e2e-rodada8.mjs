// Rodada 8: Início reorganizado (destaque, atalhos, semana, última prova, seu ano, objetivos).
// Uso: npm run build && npx vite preview --port 4173 & node scripts/e2e-rodada8.mjs
import puppeteer from 'puppeteer-core'
const iso = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const y = new Date().getFullYear()
const res = (km, t, o = {}) => ({ officialDistanceKm: km, netTime: t, isOfficial: true, watch: null, ...o })
const ck = (n, done) => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, text: ['Inscrição confirmada', 'Kit retirado', 'Documento separado', 'Roupa e tênis preparados', 'Relógio carregado', 'Transporte organizado', 'Horário de saída definido'][i], done: i < done }))
const races = [
  { id: 'a', name: '10K de Março', status: 'concluida', date: `${y}-03-01`, distanceKm: 10, feePaid: 140, result: res(10, 3000) },
  { id: 'b', name: 'Meia do Rio', status: 'concluida', date: iso(-12), distanceKm: 21.1, feePaid: 220, targetTime: 6600, result: res(21.1, 6540, { overallPlace: 812 }) },
  { id: 'c', name: 'Meia de Floripa', status: 'inscrita', date: iso(9), startTime: '06:30', city: 'Florianópolis', state: 'SC', distanceKm: 21.1, fee: 200, targetTime: 6480, bibNumber: '4821', kitPickupDate: iso(7), checklist: ck(7, 2) },
  { id: 'd', name: '10K de Natal', status: 'aberta', date: iso(30), city: 'Santos', state: 'SP', distanceKm: 10, fee: 120, lotChangeDate: iso(3) },
  { id: 'e', name: 'Corrida da Ponte', status: 'interesse', date: iso(45), distanceKm: 5 },
  { id: 'f', name: 'Maratona de SP', status: 'inscrita', date: iso(150), distanceKm: 42.195, fee: 380 }
]
const goals = [
  { id: 'g1', title: `Gastar até R$ 1.200,00 em inscrições em ${y}`, type: 'orcamento', targetValue: 1200, startDate: `${y}-01-01`, deadline: `${y}-12-31`, status: 'andamento', budgetScope: 'inscricoes', alertPct: 80 },
  { id: 'g2', title: 'Meia abaixo de 1:50:00', type: 'tempo', distanceKm: 21.1, targetValue: 6600, status: 'andamento' },
  { id: 'g3', title: `Completar 8 provas em ${y}`, type: 'quantidade', targetValue: 8, startDate: `${y}-01-01`, deadline: `${y}-12-31`, status: 'andamento' }
]
const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || 'shots'
const ok = (m) => console.log('✓ ' + m)
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await b.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
await p.evaluate((races, goals) => { localStorage.clear(); localStorage.setItem('minhas-corridas:v1', JSON.stringify({ version: 2, races, goals })) }, races, goals)
await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
const t = (await p.evaluate(() => document.body.innerText)).replace(/ /g, ' ')
const need = (s) => { if (!t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Esperava "${s}"\n---\n${t.slice(0, 2000)}`) }
const not = (s) => { if (t.toLowerCase().includes(s.toLowerCase())) throw new Error(`Não esperava "${s}"`) }

need('Faltam 9 dias'); need('Meta 1:48:00 · 5:07/km'); need('Peito 4821'); need('Kit ✓'); need('Preparação 2/7')
ok('Destaque: contagem, meta com pace, peito, kit e barra de preparação')

const tiles = await p.$$eval('.quick a', (as) => as.map((a) => a.innerText.replace(/\s+/g, ' ').trim()))
if (tiles.join('|') !== 'Resultado|Decidir 2|Treinos|Avisos') throw new Error('Atalhos: ' + tiles.join('|'))
not('+ Corrida')
ok('Atalhos com contador (Decidir 2) no lugar dos botões repetidos')

need('Esta semana'); need('Preço muda de lote')
need('Última prova'); need('Meia do Rio'); need('1:49:00'); need('Primeira meia'); need('Meta batida')
if (!(await p.$('[data-testid=last-race] a[href="/corridas/b/compartilhar"]'))) throw new Error('Sem botão de compartilhar')
ok('Última prova com tempo, pace, selos e compartilhar')

need('Seu ' + y); need('Orçamento ' + y); need('R$ 560,00 de R$ 1.200,00'); need('Com as provas em avaliação')
if (await p.$eval('.how-count', (d) => d.open)) throw new Error('Explicação deveria vir fechada')
const goalsShown = await p.$$eval('.goal-card', (c) => c.length)
if (goalsShown !== 2) throw new Error('Objetivos no Início: ' + goalsShown)
need('Próximas provas'); need('10K de Natal')
ok('Seu ano com orçamento compacto, explicação recolhida, 2 objetivos e próximas provas')

await p.screenshot({ path: `${SHOTS}/r8-inicio.png`, fullPage: true })
await b.close()
if (errors.length) { console.log('\nErros:\n' + errors.join('\n')); process.exit(1) }
console.log('\nTodos os testes da rodada 8 passaram.')
