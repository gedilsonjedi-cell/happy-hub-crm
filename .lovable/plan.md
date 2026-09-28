# Reformular a Dashboard do CRM

## Alterações
- Reorganizar a Dashboard em três faixas responsivas, preservando os oito indicadores e todas as consultas atuais por organização selecionada.
- Adicionar filtro funcional de período (Hoje, 7 dias e 30 dias) às métricas temporais e aos gráficos, sem alterar indicadores acumulados como Total de Leads e Conversas Abertas.
- Criar o destaque de Total de Leads, o bloco com três indicadores e o card de tempo médio com resumo compacto de Resolvidos, Pendentes e Em Andamento.
- Substituir o gráfico manual por barras agrupadas de atendimentos iniciados e resolvidos, com tooltip e estado vazio.
- Criar o Resumo do Dia com rosca real dos três estados, total central, legenda, valores e percentuais.
- Reorganizar a faixa inferior com desempenho por atendente, distribuição real de leads por etapa do Pipeline e atividade recente.
- Incluir carregamento, erro e ausência de dados em todos os módulos.
- Modernizar apenas a aparência da barra lateral, mantendo logo, seletor de cliente, perfil, todos os itens, permissões, badge, recolhimento e tooltips.

## Detalhes técnicos
- Reutilizar `useEffectiveOrganizationId`, Supabase e `getExternalAssignments`; toda nova consulta continuará filtrada pela organização efetiva.
- Usar Recharts e os tokens semânticos existentes (`primary`, `success`, `warning`, `info`, `neutral`, `chart`).
- Calcular percentuais somente quando houver total maior que zero e nunca preencher gráficos com dados artificiais.
- Preservar as definições atuais: `pending` = Aguardando, `active` = Em Atendimento e `resolved` = Finalizados.
- Não alterar banco, rotas, regras de negócio ou páginas além da Dashboard e da apresentação da barra.

## Verificação
- Rodar `npx tsgo --noEmit -p tsconfig.app.json`.
- Conferir o preview em desktop e celular, incluindo estados vazios, legibilidade dos gráficos, barra expandida/recolhida e ausência de sobreposição.
- Não publicar.
