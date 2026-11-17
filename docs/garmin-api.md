# Garmin: enviar treinos e receber atividades sem cabo (situação em nov/2026)

Resumo do que existe hoje para o PaceOn conversar direto com a Garmin, o que depende de quem e o
que dá para fazer enquanto isso. Levantado em 16/11/2026, a partir das páginas da Garmin e de
reportagens; confira de novo antes de agir, porque o programa mudou bastante em 2026.

## 1. Enviar treinos para o relógio (Training API)

- **O que é:** a API que publica treinos estruturados e planos no calendário do Garmin Connect,
  que depois sincroniza com o relógio. É o que permitiria um botão “Enviar para o relógio” no app.
- **Quem pode:** só **empresas** (Garmin Connect Developer Program, níveis Starter e Enterprise).
  A Garmin revisa e aprova cada integração antes de liberar.
- **Situação em 2026:** a página oficial da Training API ainda mostra “Request Now”, mas há relatos
  de que os pedidos novos ficaram pausados e de formulário “em construção” durante a reformulação
  do programa. Não há prazo garantido.
- **O que é preciso para pedir:** CNPJ, site e política de privacidade publicados (o PaceOn já tem:
  https://minhas-corridas-omega.vercel.app e /privacidade), contato (paceon.contato@gmail.com) e uma
  descrição do uso.

### Texto pronto para o pedido (quando houver CNPJ)

> **Company:** (razão social) — PaceOn
> **Website:** https://minhas-corridas-omega.vercel.app — **Privacy policy:** https://minhas-corridas-omega.vercel.app/privacidade
> **APIs requested:** Training API (publish structured running workouts to the user's Garmin Connect calendar); Activity API (receive completed activities to compare planned vs. executed).
> **Description:** PaceOn is a race-planning app for amateur runners in Brazil. Users (or their coaches) create structured running workouts — warm-up, intervals with pace or heart-rate targets, recovery, cool-down — and want them on their Garmin watch without a USB cable. With the user's authorization (OAuth), PaceOn publishes each planned workout to the user's Garmin Connect calendar. After the run, PaceOn reads the completed activity to show planned vs. executed per lap. Data is used only for the user's own planning; it is never sold or shared. Users can disconnect at any time.
> **Expected users:** small (personal project, under 100 users at launch).
> **Contact:** paceon.contato@gmail.com

## 2. Receber as próprias atividades (API pessoal) — sem aprovação, só leitura

- **O que é:** uma chave pessoal gratuita, gerada na sua conta do Garmin Connect (configurações da
  conta → token de API pessoal), sem pedido nem aprovação.
- **O que dá:** as suas atividades (resumo em JSON e o arquivo .FIT completo) e dados de saúde.
- **O que não dá:** **enviar treinos** para o relógio (isso continua só na Training API das empresas).
- **No PaceOn (feito na 0.36.0):** Treinos → “Importar do Garmin sozinho”. A chave fica só no aparelho
  (fora da conta e do backup); `api/garmin.js` (Vercel) troca a chave por um token de 24 h, lista as
  atividades (`/activitylist-service/activities/search/activities`) e baixa o original
  (`/download-service/files/activity/{id}`, .ZIP com o .FIT), sem guardar nada. Busca ao abrir o app
  (no máximo a cada 30 min), dos últimos 14 dias na primeira vez. Corrida no dia de uma prova fica para
  Resultado → “Buscar no Garmin”. Endpoints conferidos no cliente oficial `garmin/connect-personal-api-python`.

## 3. Enquanto isso (já funciona no app)

1. **Pelo celular, sem cabo:** em cada treino, “Montar no Garmin Connect” (passo a passo para criar o
   treino no app Garmin Connect e enviar ao relógio) ou “Copiar prompt para o Claude” (o Claude, com
   acesso ao navegador, cria e envia pelo Garmin Connect na web).
2. **Intervals.icu (grátis, parceiro oficial da Garmin):** “Copiar para o Intervals.icu” e, lá, ligar
   “Upload planned workouts”: os treinos do calendário vão para o Garmin Connect e o relógio.
3. **Pelo cabo:** “Baixar para o relógio (.FIT)” e copiar para `GARMIN/NewFiles`.
4. **De volta:** “Importar atividade do relógio” em Treinos (arquivo .FIT/.ZIP/.TCX/.GPX) marca o
   treino do dia como feito e compara planejado × executado.

## Fontes

- Garmin — Training API: https://developer.garmin.com/gc-developer-program/training-api
- Garmin — visão geral do programa: https://developer.garmin.com/gc-developer-program/overview
- Garmin — API pessoal: https://developer.garmin.com/gc-developer-program/personal/personal-api
- the5krunner — acesso pausado (set/2026): https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/
- the5krunner — API pessoal (out/2026): https://the5krunner.com/2026/10/22/garmin-personal-api/
- Terra — pausa no programa: https://tryterra.co/blog/garmin-connect-developer-program-pause
- Garmin Forums — formulário “Under Construction”: https://forums.garmin.com/developer/connect-iq/f/discussion/434798/cannot-access-developer-program-application-form-under-construction/2027757
