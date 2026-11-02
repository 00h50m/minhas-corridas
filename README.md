# Minhas Corridas — fase 1

App pessoal (PWA) para organizar provas de corrida de rua: calendário, inscrições, kit, custos de inscrição, resultados e histórico.

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
No `localStorage` do navegador do aparelho (chave `minhas-corridas:v1`). Sem conta e sem sincronização entre aparelhos. Use **Ajustes → Baixar backup** para gerar um `.json` e **Restaurar** para recuperar.

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

## Fase 2 (ainda não implementado)
Objetivos pessoais, custos detalhados (transporte, hospedagem, estimado x pago), checklist da prova, anexos e fotos.
