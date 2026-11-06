# PaceOn

_(antigo Minhas Corridas)_

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
- Telas menos usadas (cadastro, resultado, ajustes, conta, compartilhar, comparar…) e a biblioteca do Supabase carregam sob demanda, para o app abrir mais rápido.
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
- **Convite para instalar**: no navegador, o Início mostra “Instale o PaceOn” — com botão que abre a instalação no Android/Chrome/Edge, passo a passo no iPhone/iPad (Compartilhar → Adicionar à Tela de Início) e, dentro do Instagram/WhatsApp, orientação para abrir no Safari/Chrome. Some quando o app está instalado; “Agora não” esconde por 30 dias. Sempre disponível em Ajustes → Instalar o app. Um convite por vez (instalar antes do perfil).
- **Perfil opcional** (`/perfil`, pela foto no topo do Início ou em Ajustes): nome e apelido (saudação “Boa tarde, Gi” e “Feliz aniversário”), foto (recortada e reduzida a 320 px), cidade, equipe, data de nascimento e categoria (faixa etária pela idade em 31/12, sugerida ao registrar o resultado), tamanho de camiseta (preenche o cadastro de provas), contato de emergência e tipo sanguíneo (no modo dia da prova) e nome no card de compartilhar. O cadastro continua só e-mail e senha. Sem conta, fica no aparelho; com conta, na tabela `profiles` (trecho 9 do SQL), valendo a alteração mais recente. Entra no backup.
- **Meta x realizado**: a meta de tempo é definida antes da prova direto no detalhe (com o pace e a sugestão da previsão) e, depois do resultado, comparada com o tempo feito: na chegada, na metade e em cada passagem (a cada 1, 2,5 ou 5 km, conforme a distância), com onde ganhou e onde perdeu tempo em relação ao plano. As passagens reais vêm das parciais do relógio, ajustadas à distância oficial e ao tempo líquido; sem o arquivo do relógio, compara só a chegada. Regras em `src/lib/targetCompare.js`.
- **Orçamento do ano**: um teto de gastos (objetivo do tipo orçamento) contando só inscrições ou tudo (inscrição, transporte, hospedagem e outros), com aviso ao chegar a 70–100% e ao estourar — no Início e, com as notificações ativas, no celular (uma vez por nível). Mostra o gasto (pago ou estimado), a projeção com as provas em avaliação e as provas consideradas. Atalho em Histórico → Gastos → “Definir orçamento”. Regras em `src/lib/budget.js`.
- **Decidir** (`/decidir`, atalho no Início quando há provas de interesse ou inscrição aberta): para cada prova em avaliação, custo previsto (e por km), como fica o orçamento, prazo de lote/inscrição, provas marcadas no mesmo dia ou até 3 semanas antes/depois, objetivos para os quais conta, edições anteriores já corridas e previsão de tempo. “Quanto quero” (1–3 estrelas) para ordenar, simulação de várias provas juntas (total, orçamento, provas no ano e choques de data) e ações “Me inscrevi” / “Não vou”. O mesmo resumo aparece como “Vale a pena?” no detalhe da prova. Mostra fatores; não recomenda nem prescreve treino. Regras em `src/lib/decision.js`.
- **Agenda por assinatura** e **notificações push de prazos**: em Ajustes → Agenda e avisos. Precisam de conta (ver abaixo).
- **Modo dia da prova** (`/corridas/:id/dia`): na véspera e no dia, o destaque do Início abre uma tela com contagem até a largada, número de peito grande, local com link para o mapa, aviso de kit pendente, pace e passagens da meta (ou a previsão), checklist e opção de manter a tela acesa. Funciona sem internet. Depois da largada, botão para registrar o resultado.
- **Previsão de tempo** (fórmula de Riegel, `src/lib/predict.js`): estima o tempo numa distância pelas provas concluídas dos últimos 2 anos (3 km ou mais; oficiais primeiro), priorizando distância próxima e resultados recentes e recusando extrapolar mais de 4,5×. Aparece no detalhe de provas sem meta (com “Usar como meta”), no campo de meta do cadastro e no modo dia da prova. É estimativa, não plano de treino.

## Agenda por assinatura e notificações (opcional, precisam de conta)
Rode o `supabase/schema.sql` de novo sempre que ele mudar (trechos 6 a 9; é idempotente).

**Agenda por assinatura** — sem configuração extra. Cada pessoa gera um link secreto (`/agenda/<token>/minhas-corridas.ics`) e assina no iPhone, Google Agenda ou Outlook. A função `api/agenda.js` chama `calendar_feed` no banco com a chave pública; o banco devolve só nome, data, horário, local, status, nº de peito, kit e prazos (nunca custos, notas ou resultados). Trocar o link invalida o anterior. Entram as provas com data (sem canceladas/desistências) de até 1 ano atrás. Mostra o que já foi sincronizado com a nuvem. Cada calendário decide quando atualizar (o Google pode levar até um dia).

**Notificações push** — um envio por dia (Vercel Cron, `vercel.json`, 11:00 UTC = 8h de Brasília). Cada pessoa escolhe quais avisos e com quanta antecedência (vale para todos os aparelhos; trecho 8 do SQL, tabela `push_prefs`): fim da inscrição (7, 3, 1 dia ou no dia), mudança de lote (3 ou 1 dia), retirada do kit (véspera e/ou no dia, até marcar “Kit retirado”), prova (2 dias, véspera ou no dia), um resumo da semana às segundas e o aviso de orçamento. Padrão: inscrição 3 dias antes e no dia, lote na véspera, kit na véspera e no dia, prova na véspera. Sem a tabela `push_prefs`, vale o padrão. Nunca manda a mesma duas vezes (`push_log`). No iPhone, só com o app na Tela de Início (iOS 16.4+). Variáveis no Vercel (Settings → Environment Variables), depois um novo deploy:

| Variável | O quê |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Gere uma vez com `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:seu-email` (contato exigido pelos serviços de push) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → *service_role*. **Só no Vercel**, nunca com prefixo `VITE_` |
| `CRON_SECRET` | Texto aleatório longo; o Vercel o envia ao chamar o cron |

Sem essas variáveis, o app avisa que as notificações não estão configuradas e o resto funciona normalmente. Testes: `npm test` (regras, rodada diária, funções) e `node scripts/e2e-rodada4.mjs` / `e2e-rodada5.mjs` (telas, com Supabase simulado; o push é entregue ao service worker pelo DevTools).

## Regras de custos
- Inscrição estimada = inscrição + taxas; o valor pago, quando informado, substitui a estimativa (nunca soma as duas).
- Em cada categoria (inscrição, transporte, hospedagem, outros) vale o pago; sem pago, o estimado.
- Inscrita/Concluída entram no gasto; Desisti/Cancelada só com valor pago; Interesse/Inscrição aberta aparecem como previsão.

## Marca
- A arte original fica em `brand/paceon-original.png`. `node scripts/icons.mjs` gera a partir dela: `icon-192/512.png` (cantos transparentes), `icon-maskable-512.png` (Android, conteúdo na área segura), `apple-touch-icon.png` (iPhone, opaco), `favicon.png` e `logo-256.png` (topo do app e card de compartilhar).
- Cores: laranja `#FF5F24` e azul-escuro `#17152F`, tiradas do logo.
- Os nomes internos continuam `minhas-corridas` (chaves do armazenamento, banco de arquivos, backup e UIDs do .ics), para não perder dados nem duplicar eventos na agenda. Links antigos da agenda (`.../minhas-corridas.ics`) seguem funcionando; os novos terminam em `paceon.ics`.

## Fora do escopo
GPS, prescrição de treinos, rede social, integrações (Garmin/Strava), busca automática de provas. O card de compartilhar gera só a imagem; não publica em nenhuma rede.
