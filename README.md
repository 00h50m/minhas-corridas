# Minhas Corridas — fases 1 e 2

App pessoal (PWA) para organizar provas de corrida de rua: calendário, inscrições, kit, custos (estimado x pago), checklist, anexos e fotos, resultados, histórico e objetivos pessoais.

## Rodar localmente
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes das regras (datas, tempos, pace, filtros, .ics, backup)
```

## Publicar no Vercel
1. Suba esta pasta para um repositório no GitHub.
2. No Vercel: **Add New → Project → Import** o repositório.
3. Framework: **Vite** (detectado sozinho). Build `npm run build`, saída `dist`.
4. Deploy. O `vercel.json` já cuida das rotas internas (abrir `/corridas/...` direto funciona).

Não há variáveis de ambiente nem chaves.

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

## Regras de custos
- Inscrição estimada = inscrição + taxas; o valor pago, quando informado, substitui a estimativa (nunca soma as duas).
- Em cada categoria (inscrição, transporte, hospedagem, outros) vale o pago; sem pago, o estimado.
- Inscrita/Concluída entram no gasto; Desisti/Cancelada só com valor pago; Interesse/Inscrição aberta aparecem como previsão.

## Fora do escopo
GPS, prescrição de treinos, rede social, integrações (Garmin/Strava), busca automática de provas, login e sincronização.
