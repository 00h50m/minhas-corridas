# Backlog

Ideias especificadas, ainda não feitas. Cada item tem o porquê, o que entra, o que não entra e os
cuidados. Prioridade e ordem são decididas na hora de fazer.

---

## 1. Ciclo menstrual nos treinos e nas provas

**Status:** MVP feito na 0.42.0 (registro, previsão, prova/reta final, “como você chega hoje”, pontos na semana, sinais, importação do Garmin, sincronização). **Falta:** Fase 2 (o padrão dela por fase) e o aviso ao remanejar (item f). · **Pedido em:** 18/11/2026

**Decisões da usuária (18/11):** registra o ciclo no Garmin e no Flo; não usa anticoncepcional hormonal; tudo sincroniza com a conta. O Flo não tem acesso para apps → histórico entra à mão (“Adicionar menstruação passada”). A chave do Garmin é a exceção: credencial, fica só no aparelho.

### Por que

O ciclo afeta como muitas corredoras se sentem e rendem, mas **de forma muito individual**. As
pesquisas sobre "fase X é melhor para treino forte" têm resultados mistos e diferenças pequenas na
média, enquanto os sintomas de cada pessoa (cólica, fluxo intenso, sono ruim, inchaço, energia baixa
na TPM) variam muito e são o que de fato atrapalha um treino ou uma prova.

Por isso a funcionalidade **não** deve prescrever treino por fase ("na fase lútea faça só leve"). Ela
deve:

1. tornar o registro **rápido** (2 toques);
2. **prever** os próximos dias a partir do histórico **da própria pessoa**;
3. **antecipar a prova** (em que dia do ciclo ela cai e o que levar/planejar);
4. depois de alguns ciclos, mostrar **o padrão dela** (com os dados de treino que o app já tem);
5. apontar **sinais que merecem conversa com um profissional** (sem diagnosticar).

### Quem usa

Corredoras que menstruam, com ou sem anticoncepcional, com ciclos regulares ou não. Opcional e
desligado por padrão; ativado em Perfil → "Ciclo menstrual".

### O que entra (MVP)

**a) Registro em 2 toques** — no Início (quando ativado) e no treino do dia:
- "Menstruação começou hoje" / "terminou";
- fluxo: leve · moderado · intenso;
- sintomas (opcionais, um toque cada): cólica, dor de cabeça, inchaço, sono ruim, energia baixa,
  humor/irritação, enjoo, sensibilidade nos seios;
- energia do dia: 1–5.
- Registro retroativo pelo calendário (esqueceu ontem → marca ontem).

**b) Previsão** (só com histórico próprio):
- duração média do ciclo e do sangramento a partir dos **últimos 6 ciclos** (mínimo 2 para prever;
  com 1 ciclo, mostra "ainda aprendendo");
- faixa de confiança: se a variação entre ciclos passar de 7 dias, a previsão vira "entre 12 e 19/12"
  e o app avisa que o ciclo está irregular — sem alarme;
- com anticoncepcional hormonal (pergunta opcional), explica que o sangramento é de privação e que a
  previsão segue a cartela, não a ovulação.

**c) Calendário e semana de treinos** — os dias previstos de menstruação aparecem discretos (um ponto
lilás) na semana de treinos e no calendário de provas. Nada aparece em stories, cards ou agenda .ics.

**d) Prova** (o ponto de maior valor) — na tela da prova e na **Reta final**:
- "Pela sua previsão, a prova cai no **dia 2 do ciclo** (provável fluxo intenso pelo seu histórico)";
- itens extras na reta final, só se a prova cair perto do período previsto:
  - "Testar num treino longo o absorvente/coletor/calcinha que vai usar";
  - "Separar: produtos extras, analgésico que você já usa (o mesmo de sempre, nada novo no dia),
    roupa escura";
  - "Ver no mapa do percurso onde ficam os banheiros/postos" (link para a logística);
- se ela registrar que no ciclo anterior teve cólica forte nos dias 1–2, sugere falar com o
  profissional de saúde dela com antecedência sobre como manejar no dia — **sem indicar remédio**.

**e) "Como você chega hoje"** (cartão que já existe, do Garmin) — passa a considerar o registro do
dia: "dia 1 do ciclo · cólica · energia 2". Mantém o tom: "Se sentir cansaço, ir mais leve é uma
opção." Funciona mesmo sem Garmin.

**f) Remanejar** — a regra de remanejar ganha um aviso (não um bloqueio): ao mover um treino forte
para um dia previsto de fluxo intenso **em que ela costuma registrar energia baixa**, mostra "nos
seus últimos ciclos, este dia costuma ser difícil". Só com dados dela (≥ 3 ciclos).

### Fase 2 — o padrão dela (depois de ≥ 3 ciclos registrados)

Uma tela "Seu ciclo e seus treinos" com comparações **pessoais**, sempre com o tamanho da amostra:
- pace médio e esforço percebido nos treinos por fase (dias de sangramento, primeira metade,
  segunda metade, 5 dias antes);
- treinos marcados como "não fiz" e remanejados por fase;
- sono/body battery por fase (com Garmin);
- frases do tipo "Nos dias 1–2, seus treinos foram em média 12 s/km mais lentos (8 treinos em 4
  ciclos)" e, quando não houver diferença, dizer isso também ("sem diferença clara no seu ritmo").
- Nunca extrapolar: menos de 5 treinos numa fase → "poucos dados".

**Garmin:** a API pessoal tem `periodichealth-service/menstrualcycle/summary` e `/dayview`. Se a
pessoa já registra o ciclo no Garmin Connect, importar de lá (só leitura) em vez de registrar duas
vezes, com o mesmo cuidado de formato que já usamos (diagnóstico se vier diferente).

### Sinais de atenção (mensagem gentil + "converse com sua ginecologista")

Mostrados uma vez, com opção de não ver mais, nunca como diagnóstico:
- **sem menstruar por 3 meses ou mais** (sem anticoncepcional que explique) — em atletas pode estar
  ligado a baixa disponibilidade de energia (RED-S), que afeta ossos e desempenho;
- **fluxo intenso frequente + "energia baixa" recorrente** — vale checar ferro/ferritina com
  profissional (deficiência de ferro é comum em corredoras e derruba o rendimento);
- **cólica forte que impede treinar** na maioria dos ciclos;
- **ciclos muito curtos (< 21 dias) ou muito longos (> 35 dias)** de forma recorrente.

### Privacidade (dados sensíveis — LGPD art. 11)

- **Desligado por padrão**; ao ativar, consentimento explícito com texto claro do que é guardado.
- **Fica só no aparelho** por padrão (como o sono do Garmin). Sincronizar com a conta é uma segunda
  opção, desligada, com aviso próprio; se ligada, dados num registro separado (`kind: 'cycle'`),
  apagados junto com a conta.
- Fora de backup em texto puro por padrão (backup só se ela escolher incluir).
- Notificações **discretas**: "Lembrete do PaceOn" sem mencionar ciclo na tela de bloqueio.
- Nunca em stories, cards de compartilhamento, agenda .ics, prompt do Claude ou Intervals.icu.
- Botão "Apagar todos os dados do ciclo".
- Atualizar `/privacidade` antes de publicar.

### Dados (rascunho)

```
cycle: {
  enabled, syncToAccount, hormonal: null | 'pilula' | 'diu-hormonal' | 'implante' | 'outro' | 'nenhum',
  periods: [{ start: 'AAAA-MM-DD', end: 'AAAA-MM-DD' | null }],          // últimos 24
  days: { 'AAAA-MM-DD': { flow: 0-3, symptoms: ['colica', ...], energy: 1-5 } },  // últimos 365
  dismissed: ['amenorreia', ...]                                          // avisos já vistos
}
```
Funções puras (`src/lib/cycle.js`): `cycleStats(periods)`, `predict(periods, from, days)`,
`phaseOn(date)`, `raceCycleNote(race)`, `personalPatterns(cycle, workouts)` — todas testáveis.

### Como saber se ajudou

- Ela registra em ≤ 2 toques e continua registrando depois de 2 ciclos.
- Antes de uma prova que cai no período, os itens extras aparecem na reta final e ela marca.
- A previsão erra o início em ≤ 2 dias na maioria dos ciclos regulares.

### Cuidados de produto

- Linguagem acolhedora e sem estereótipo ("TPM" só se ela usar o termo; preferir "dias antes").
- Não é método contraceptivo nem ferramenta de fertilidade — dizer isso explicitamente.
- Revisar os textos de saúde com uma profissional (ginecologista ou fisiologista do esporte) antes
  de publicar.
- Fora do escopo por enquanto: gestação, pós-parto e perimenopausa (merecem tratamento próprio).

### Perguntas em aberto (para decidir com a usuária)

1. Prefere registrar no PaceOn ou já registra no Garmin Connect / outro app (Clue, Flo)?
2. Usa anticoncepcional hormonal? (muda a previsão e os textos)
3. Quer que sincronize entre celular e computador ou só no celular?
