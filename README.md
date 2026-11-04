# Minhas Corridas

App pessoal (PWA) para organizar provas de corrida de rua: calendário, inscrições, kit, custos (estimado x pago), checklist, anexos e fotos, resultados, histórico e objetivos pessoais.

## Rodar localmente
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes das regras e do motor de sincronização
```

## Publicar no Vercel
1. Suba esta pasta para um repositório no GitHub.
2. No Vercel: **Add New → Project → Import** o repositório.
3. Framework: **Vite** (detectado sozinho). Build `npm run build`, saída `dist`.
4. Deploy. O `vercel.json` já cuida das rotas internas (abrir `/corridas/...` direto funciona).

Não há variáveis de ambiente obrigatórias. As notificações push precisam de algumas (ver “Agenda por assinatura e notificações”).

## Onde ficam os dados
- Corridas, resultados, custos, checklists e objetivos: `localStorage` (chave `minhas-corridas:v1`, formato versão 2).
- Anexos e fotos: IndexedDB (`minhas-corridas-arquivos`).

Sem conta e sem sincronização entre aparelhos. **Ajustes** (engrenagem no Início) → **Baixar backup** gera um `.json`; marque “Incluir anexos e fotos” para levar os arquivos junto. **Restaurar** aceita backups da fase 1 e da fase 2.

## Teste ponta a ponta
```bash
npm run build && npx vite preview --port 4173 &
node scripts/e2e.mjs   # precisa do Google Chrome em /usr/bin/google-chrome
```

## Estrutura
- `src/lib` — regras puras: datas locais, tempos/pace, validação, estatísticas, .ics
- `src/services` — persistência (store) e backup
- `src/components` — UI compartilhada (navegação, cards, diálogos)
- `src/pages` — Início, Corridas (lista/mês/filtros), Cadastro, Detalhe, Resultado, Histórico, Ajustes

## Conta e sincronização (fase 3, opcional)
Sem configuração, o app funciona só no aparelho. Testes das telas de conta com o Supabase simulado: `node scripts/e2e-conta.mjs`. Para login e sincronização entre aparelhos:

1. Crie um projeto no [Supabase](https://supabase.com).
2. **SQL Editor → New query**: cole e rode `supabase/schema.sql` (tabela `records` com RLS por usuário e bucket privado `anexos`).
3. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do app no Vercel (ex.: `https://minhas-corridas.vercel.app`) e adicione o mesmo em *Redirect URLs*. É para onde vão os links de confirmação de e-mail e de nova senha.
4. **Vercel → Settings → Environment Variables**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Supabase → Settings → API, chave *anon/public*). Depois, faça um novo deploy.

Como funciona:
- Login com e-mail e senha. Cada usuário só acessa as próprias linhas (RLS) e a própria pasta de anexos.
- O aparelho continua sendo a fonte da tela e funciona offline; alterações ficam pendentes e sobem quando houver conexão (ao abrir o app, ao voltar a internet, a cada minuto e logo após cada alteração).
- Conflitos: vale a alteração mais recente (o banco recusa gravações mais antigas).
- Primeiro login num aparelho com dados: o app pergunta se envia esses dados para a conta.
- Sair da conta apaga os dados deste aparelho; eles continuam na conta.
- **Excluir minha conta** (Conta → Zona de cuidado, digitando EXCLUIR): confere a função `delete_my_account` no banco, apaga os anexos do bucket, os registros e o usuário. Precisa do trecho 5 do `schema.sql`.
- **Entrar com Google**: o botão só aparece quando o provedor Google está ativo no Supabase (Authentication → Sign In / Providers → Google, com Client ID e Secret do Google Cloud).

## Recursos extras
- **Avisos dos próximos 7 dias** no Início (fim da inscrição, mudança de lote, retirada do kit, dia da prova).
- **Agenda (.ics)** com lembrete na véspera e eventos separados para retirada do kit e fim da inscrição.
- **Aviso de nova versão** com botão "Atualizar".
- **Repetir prova** no ano seguinte (copia o evento, sem data, valores ou resultado).
- **Preencher pelo link da inscrição**: a função `api/preview.js` (Vercel) lê só a página indicada e devolve campos sugeridos (prioriza dados estruturados schema.org; senão, título e texto). Bloqueia endereços internos, limita tempo e tamanho e nunca devolve o HTML. Só funciona no app publicado. Se a página não trouxer os dados (sites montados no navegador), usa o próprio link: nome a partir do endereço e cidade/UF pela lista de municípios do IBGE (`src/data/municipios.json`, extraída do pacote npm `municipios-brasil`, licença MIT).
- **Arquivo do relógio** no resultado: .FIT, .ZIP do Garmin ("Exportar original"), .TCX ou .GPX. Distância e tempo do relógio, FC, subida e parciais por km. Guarda só o resumo. O leitor de FIT (`src/lib/fit.js`) é próprio, escrito a partir da especificação do protocolo; o SDK oficial do Garmin (`@garmin/fitsdk`) é usado só nos testes, para gerar arquivos de verdade, e não vai para o app publicado.
- **Análise da prova**: meta x resultado, ritmo pelas parciais (saída forte, quebra, split negativo), esforço, distância do relógio e comparação com provas anteriores.
- **Plano de prova / do objetivo**: pace e passagens para a meta, quanto falta para o objetivo de tempo, degrau intermediário e próximas provas candidatas. É plano de ritmo, não de treino.
- **Evolução**: este ano x anterior (até a mesma data), provas por mês e pace por distância.
- **Card para compartilhar** (Resultado → Compartilhar): imagem PNG gerada no aparelho, nos formatos feed (4:5), stories (9:16) e quadrado. Distância, tempo, pace, classificação, selos (recorde pessoal, primeira na distância, meta batida) e as parciais por km; fundo na cor do app ou com uma foto da prova. Usa o compartilhamento do celular; onde não há, baixa a imagem.
- **Comparar provas km a km** (Histórico → Comparar, ou no resultado): tempo, pace, FC, subida e esforço lado a lado; diferença por km e acumulada, maior ganho e perda, e em qual metade veio a diferença. Precisa das parciais do arquivo do relógio; sem elas, compara só os totais.
- **Agenda por assinatura** e **notificações push de prazos**: em Ajustes → Agenda e avisos. Precisam de conta (ver abaixo).

## Agenda por assinatura e notificações (opcional, precisam de conta)
Rode o `supabase/schema.sql` de novo (trechos 6 e 7 são novos; é idempotente).

**Agenda por assinatura** — sem configuração extra. Cada pessoa gera um link secreto (`/agenda/<token>/minhas-corridas.ics`) e assina no iPhone, Google Agenda ou Outlook. A função `api/agenda.js` chama `calendar_feed` no banco com a chave pública; o banco devolve só nome, data, horário, local, status, nº de peito, kit e prazos (nunca custos, notas ou resultados). Trocar o link invalida o anterior. Entram as provas com data (sem canceladas/desistências) de até 1 ano atrás. Mostra o que já foi sincronizado com a nuvem. Cada calendário decide quando atualizar (o Google pode levar até um dia).

**Notificações push** — um envio por dia (Vercel Cron, `vercel.json`, 11:00 UTC = 8h de Brasília): fim da inscrição (3 dias antes e no dia), mudança de lote (véspera), retirada do kit (véspera e no dia, até marcar “Kit retirado”) e prova (véspera). Nunca manda a mesma duas vezes (`push_log`). No iPhone, só com o app na Tela de Início (iOS 16.4+). Variáveis no Vercel (Settings → Environment Variables), depois um novo deploy:

| Variável | O quê |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Gere uma vez com `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:seu-email` (contato exigido pelos serviços de push) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → *service_role*. **Só no Vercel**, nunca com prefixo `VITE_` |
| `CRON_SECRET` | Texto aleatório longo; o Vercel o envia ao chamar o cron |

Sem essas variáveis, o app avisa que as notificações não estão configuradas e o resto funciona normalmente. Testes: `npm test` (regras, rodada diária, funções) e `node scripts/e2e-rodada4.mjs` (telas, com Supabase simulado; o push é entregue ao service worker pelo DevTools).

## Regras de custos
- Inscrição estimada = inscrição + taxas; o valor pago, quando informado, substitui a estimativa (nunca soma as duas).
- Em cada categoria (inscrição, transporte, hospedagem, outros) vale o pago; sem pago, o estimado.
- Inscrita/Concluída entram no gasto; Desisti/Cancelada só com valor pago; Interesse/Inscrição aberta aparecem como previsão.

## Fora do escopo
GPS, prescrição de treinos, rede social, integrações (Garmin/Strava), busca automática de provas. O card de compartilhar gera só a imagem; não publica em nenhuma rede.
