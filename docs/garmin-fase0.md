# Integração Garmin — Fase 0 (prova de conceito)

Objetivo: descobrir, antes de construir qualquer coisa no app, se (1) o Forerunner 165 aceita um
**arquivo FIT de treino estruturado** gerado pelo PaceOn e (2) se a Garmin aprova o acesso à
Training API. Nada no app muda nesta fase.

> Arquivo de **treino** (o que fazer: passos, repetições, alvos) ≠ arquivo de **atividade**
> (o que foi feito). O PaceOn hoje só **lê** atividades; esta fase testa **gerar** treinos.

## 1. Arquivos de teste

Gerados com o SDK oficial da Garmin (`@garmin/fitsdk`) e conferidos lendo de volta (cabeçalho e CRC):

```bash
node scripts/fit-workout-poc.mjs PACEON20MIN.fit --simples   # 1 passo: corrida leve 20 min, sem alvo
node scripts/fit-workout-poc.mjs PACEON6X800.fit             # 10' aquec. → 6×(800 m a 4:50–5:10/km + 2' rec.) → 10' desaq.
```

O arquivo simples serve de controle: se ele funcionar e o de tiros não, o problema é o formato
(repetição ou alvo de pace), não o envio.

## 2. Teste no Forerunner 165 (precisa de computador e do cabo)

1. Feche o Garmin Express, se estiver aberto.
2. Ligue o relógio ao computador pelo cabo.
3. Veja como ele aparece:
   - **Windows:** em “Este Computador”, como **Forerunner 165** (dispositivo portátil/MTP) ou como unidade de disco.
   - **Mac:** como unidade no Finder **ou** não aparece (relógios MTP precisam de um programa como o OpenMTP / Android File Transfer).
4. Abra a pasta **GARMIN** e procure **NewFiles** (se existir) ou **Workouts**.
5. Copie `PACEON20MIN.fit` para **GARMIN/NewFiles** (ou, se não houver, para **GARMIN/Workouts**).
6. Ejete com segurança e desconecte. Aguarde o relógio processar.
7. No relógio: **Corrida → Opções (botão de cima à esquerda / UP segurado) → Treinos** e procure “PaceOn 20min”.
8. Se aparecer, repita com `PACEON6X800.fit`, inicie o treino e observe.

### O que anotar (me mande)
| Pergunta | Resposta |
|---|---|
| Como o relógio apareceu no computador (unidade de disco, dispositivo portátil, não apareceu)? | |
| Existe `GARMIN/NewFiles`? Em qual pasta você copiou? | |
| O arquivo sumiu da pasta depois de desconectar (sinal de que o relógio importou)? | |
| “PaceOn 20min” apareceu em Treinos? | |
| “PaceOn 6x800” apareceu? Mostra os 5 passos e “Repetir 6×”? | |
| O tiro mostra a faixa de pace 4:50–5:10/km e alerta fora da faixa? | |
| Aquecimento, recuperação e desaquecimento aparecem com esses nomes? | |
| Fotos da tela do relógio (lista de passos e o tiro em execução) | |

## 3. Pedido de acesso à Garmin (Training API)

Feito em paralelo, porque a análise da Garmin costuma demorar. Pelo que se sabe (confirmar no site):
o acesso é pelo **Garmin Connect Developer Program**, voltado a empresas/organizações, com aprovação caso a caso.

- Página: https://developer.garmin.com/gc-developer-program/ → formulário de acesso (“Request Access” / “Apply”).
- APIs a pedir: **Training API** (enviar e agendar treinos) e **Activity API** (receber atividades concluídas).
- Prepare:
  - Nome do app (PaceOn), site (https://minhas-corridas-omega.vercel.app) e descrição curta:
    *“App de planejamento de provas de corrida. Os treinos planejados pelo usuário são enviados ao Garmin Connect para execução no relógio; as atividades concluídas voltam para comparar planejado x executado.”*
  - **Política de privacidade** publicada (o que é coletado, para quê, como apagar). Ainda não existe no app — necessária antes do pedido.
  - Responsável e e-mail de contato: paceon.contato@gmail.com; se houver, CNPJ/empresa (o programa costuma pedir).
  - Volume estimado de usuários (uso pessoal / poucos usuários).
- Não envie nenhuma chave a ninguém; as credenciais da Garmin, quando aprovadas, ficam só nas variáveis do Vercel.

## 4. Decisão de produto (antes da fase 1)

O README hoje diz que **prescrição de treinos** e **integrações (Garmin/Strava)** estão fora do escopo.
A proposta é mudar para: *o PaceOn guarda e envia treinos **criados por você ou pelo seu treinador***
(o app não inventa treinos). Fases seguintes, se aprovado:

1. Treinos no PaceOn (modelo, editor, calendário, sincronização).
2. Exportar o FIT de treino pelo app (o que este teste valida).
3. Planejado × executado a partir do FIT da atividade (já suportado).
4. Training API (depende da aprovação).
5. Atividades automáticas (depende da aprovação).
