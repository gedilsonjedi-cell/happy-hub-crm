# Corrigir consistência do restyle Datacrazy

## Objetivo
Restaurar proporção e consistência visual em Atendimento, Disparos e Relatórios, mantendo o tema claro/azul e sem alterar regras ou fluxos do CRM.

## Implementação
1. Remover o `font-size: 13px` da raiz e manter o navegador em 16px.
2. Criar no Tailwind uma escala compacta explícita de tipografia e espaçamento, reduzindo proporcionalmente os utilitários usados pelo sistema sem afetar medidas fixas em pixels.
3. Revisar ícones, gráficos, listas virtualizadas, painéis e alturas fixas nas três áreas; ajustar somente dimensões que ficarem desproporcionais à nova escala.
4. Substituir cores diretas herdadas do visual antigo por tokens semânticos nas páginas e componentes diretamente usados por Atendimento, Disparos e Relatórios.
5. Preservar cores com significado funcional — sucesso, alerta, erro, canal e séries de gráficos — mas fazê-las passar por tokens temáticos, evitando classes de paleta crua no JSX.
6. Validar o preview em desktop nas três telas e executar a verificação TypeScript definida para o projeto.

## Detalhes técnicos
- A escala padrão do Tailwind será redefinida em `theme.extend.fontSize` e `theme.extend.spacing`, com valores compactos explícitos.
- Novos papéis de cor necessários para estados e gráficos serão definidos como variáveis HSL em `src/index.css` e expostos em `tailwind.config.ts`.
- Não haverá mudança em consultas, envio de mensagens, campanhas, relatórios ou qualquer lógica de negócio.
- Tudo permanecerá apenas no preview; nada será publicado.
