// “Está tudo ligado?”: o que está ativo e o que falta configurar, com o passo para resolver.
// Função pura: recebe o que a tela já descobriu (conta, sincronização, banco, notificações, Garmin…).
// status: 'ok' | 'warn' | 'off' (opcional, desligado) | 'check' (conferir à mão) | 'unknown'

const TRECHO = { workout: 11, cycle: 12, garmin: 12, ficha: 13 }
const KIND_LABEL = { workout: 'treinos', cycle: 'ciclo', garmin: 'dados do Garmin', ficha: 'ficha da academia' }
const ago = (iso, now) => {
  if (!iso) return null
  const min = Math.round((now - Date.parse(iso)) / 60000)
  return min < 2 ? 'agora há pouco' : min < 60 ? `há ${min} min` : min < 48 * 60 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`
}

export function setupChecks({ sync = {}, push = {}, rpc = {}, garmin = null, program = null, cycle = null, today, now = Date.now() }) {
  const rows = []
  const signed = sync.configured && sync.user
  // Conta e sincronização
  if (!sync.configured) rows.push({ id: 'conta', group: 'Conta', title: 'Conta', status: 'off', text: 'Este app foi publicado sem conta: os dados ficam só neste aparelho. Faça backup de vez em quando.', to: '/ajustes', action: 'Backup' })
  else if (!signed) rows.push({ id: 'conta', group: 'Conta', title: 'Conta', status: 'warn', text: 'Sem conta conectada: os dados ficam só neste aparelho e os desafios e o link para o treinador não funcionam.', to: '/conta', action: 'Entrar' })
  else rows.push({ id: 'conta', group: 'Conta', title: 'Conta', status: 'ok', text: `Conectada${sync.user.email ? ` como ${sync.user.email}` : ''}.` })
  if (signed) {
    const err = sync.phase === 'error'
    rows.push({
      id: 'sync', group: 'Conta', title: 'Sincronização',
      status: err ? 'warn' : sync.phase === 'offline' ? 'warn' : sync.lastSyncAt ? 'ok' : 'unknown',
      text: err ? `Erro na última tentativa: ${sync.error}` : sync.phase === 'offline' ? 'Sem internet agora; sincroniza quando voltar.' : sync.lastSyncAt ? `Última sincronização ${ago(sync.lastSyncAt, now)}${sync.pending ? ` · ${sync.pending} ${sync.pending === 1 ? 'alteração esperando' : 'alterações esperando'}` : ''}.` : 'Ainda não sincronizou nesta sessão.',
      to: '/conta', action: 'Ver conta'
    })
    // Trechos do banco
    const deferred = sync.deferredKinds ?? []
    for (const [n, kinds, label] of [[11, ['workout'], 'Treinos na nuvem'], [12, ['cycle', 'garmin'], 'Ciclo e Garmin na nuvem'], [13, ['ficha'], 'Ficha da academia na nuvem']]) {
      const miss = kinds.filter((k) => deferred.includes(k))
      rows.push({
        id: `sql${n}`, group: 'Banco (Supabase)', title: `${label} (trecho ${n})`,
        status: miss.length ? 'warn' : sync.lastSyncAt ? 'ok' : 'unknown',
        text: miss.length ? `O banco ainda não aceita ${miss.map((k) => KIND_LABEL[k]).join(' e ')}: rode o trecho ${n} do supabase/schema.sql no SQL Editor do Supabase. Até lá, fica neste aparelho.` : sync.lastSyncAt ? 'Ativo (ou sem nada pendente desse tipo).' : 'Confere na próxima sincronização.'
      })
    }
    for (const [key, n, label, what] of [['challenges', 14, 'Desafios com amigas', 'os desafios'], ['reports', 15, 'Link para o treinador', 'o link só de leitura do relatório']]) {
      const st = rpc[key] ?? 'unknown'
      rows.push({ id: `sql${n}`, group: 'Banco (Supabase)', title: `${label} (trecho ${n})`, status: st === 'ok' ? 'ok' : st === 'missing' ? 'warn' : 'unknown', text: st === 'ok' ? 'Ativo.' : st === 'missing' ? `Para usar ${what}, rode o trecho ${n} do supabase/schema.sql no SQL Editor do Supabase.` : 'Não deu para conferir agora (sem conexão?).' })
    }
  }
  // Notificações
  if (push.support === 'ios-install') rows.push({ id: 'push', group: 'Avisos', title: 'Notificações neste aparelho', status: 'warn', text: 'No iPhone, as notificações só funcionam com o app na Tela de Início (Compartilhar → Adicionar à Tela de Início).', to: '/ajustes', action: 'Instalar' })
  else if (push.support === 'unsupported') rows.push({ id: 'push', group: 'Avisos', title: 'Notificações neste aparelho', status: 'off', text: 'Este navegador não recebe notificações.' })
  else if (push.server === false) rows.push({ id: 'push', group: 'Avisos', title: 'Notificações', status: 'warn', text: 'O servidor ainda não tem as chaves das notificações (variáveis VAPID na Vercel) e um novo deploy.' })
  else if (push.permission === 'denied') rows.push({ id: 'push', group: 'Avisos', title: 'Notificações neste aparelho', status: 'warn', text: 'Bloqueadas no navegador: libere nas configurações do site/app e ative em Lembretes.', to: '/lembretes', action: 'Lembretes' })
  else if (!push.subscribed) rows.push({ id: 'push', group: 'Avisos', title: 'Notificações neste aparelho', status: signed ? 'warn' : 'off', text: signed ? 'Desligadas: ative em Lembretes para receber o treino do dia, o “fez o treino?” e os prazos das provas.' : 'Precisam de conta.', to: '/lembretes', action: 'Ativar' })
  else rows.push({ id: 'push', group: 'Avisos', title: 'Notificações neste aparelho', status: 'ok', text: 'Ativas. Escolha quais avisos em Lembretes.', to: '/lembretes', action: 'Lembretes' })
  rows.push({ id: 'cron', group: 'Avisos', title: 'Envios automáticos (8h e 20h)', status: 'check', text: 'Confira na Vercel → projeto → Settings → Cron Jobs: devem aparecer 2 envios (/api/push-cron e /api/push-cron?slot=noite). No plano gratuito podem atrasar até 1 hora.' })
  // Garmin
  if (!garmin?.key) rows.push({ id: 'garmin', group: 'Relógio', title: 'Garmin', status: 'off', text: 'Não conectado neste aparelho (a chave fica só no aparelho). Opcional: os treinos feitos entram sozinhos.', to: '/treinos', action: 'Conectar' })
  else {
    const old = garmin.lastSync && now - Date.parse(garmin.lastSync) > 3 * 86400000
    rows.push({ id: 'garmin', group: 'Relógio', title: 'Garmin', status: old ? 'warn' : 'ok', text: garmin.lastSync ? `Conectado · última busca ${ago(garmin.lastSync, now)}${old ? ' (abra Treinos para buscar de novo)' : ''}.` : 'Conectado; ainda não buscou atividades.', to: '/treinos', action: 'Treinos' })
  }
  // Ficha e ciclo
  if (!program) rows.push({ id: 'ficha', group: 'Treinos', title: 'Ficha da academia', status: 'off', text: 'Nenhuma ficha cadastrada (opcional).', to: '/academia', action: 'Cadastrar' })
  else rows.push({ id: 'ficha', group: 'Treinos', title: 'Ficha da academia', status: program.to && program.to < today ? 'warn' : 'ok', text: program.to && program.to < today ? `A ficha venceu em ${program.to.split('-').reverse().join('/')}: cadastre a nova quando receber.` : `${program.title} · ${program.sheets.length} treinos${program.to ? ` · até ${program.to.split('-').reverse().join('/')}` : ''}.`, to: '/academia', action: 'Ficha' })
  rows.push(cycle?.enabled
    ? { id: 'ciclo', group: 'Treinos', title: 'Ciclo menstrual', status: 'ok', text: `Ativo · ${cycle.periods?.length ?? 0} ${cycle.periods?.length === 1 ? 'registro' : 'registros'}.`, to: '/ciclo', action: 'Ciclo' }
    : { id: 'ciclo', group: 'Treinos', title: 'Ciclo menstrual', status: 'off', text: 'Desligado (opcional).', to: '/ciclo', action: 'Ver' })
  return rows
}

/** Resumo: quantos itens pedem atenção. */
export const attention = (rows) => rows.filter((r) => r.status === 'warn').length
