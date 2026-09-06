## Ajustes visuais do Optimus

### Dashboard
- Preservar todas as consultas, métricas e valores atuais.
- Reorganizar os oito indicadores em uma faixa responsiva de cards limpos, com rótulo, valor e ícone em fundo suave.
- Refinar o gráfico, o resumo diário, o desempenho dos atendentes e a atividade recente com bordas discretas, espaçamento consistente e hierarquia tipográfica clara.

### Barra lateral
- No modo recolhido, substituir o seletor espremido por uma inicial circular da organização, com tooltip do nome completo.
- No modo expandido, exibir nome truncado e seta de abertura sem quebra de linha, mantendo a troca de organização atual.
- Aumentar a logo para 40px, preservando proporção com `object-contain`.

### Validação
- Conferir dashboard e barra lateral no preview em tamanhos desktop e móvel.
- Rodar o typecheck do projeto.
- Não publicar.

### Detalhes técnicos
- Alterações restritas a `src/pages/Index.tsx`, `src/components/admin/ClientSwitcher.tsx` e `src/components/layout/TopNavLayout.tsx`.
- As duas logos têm 1920 × 711 px, resolução suficiente para exibição a 40px sem pixelização.
