# Corrigir Web Chat público no celular

## Interface móvel
- Atualizar a configuração de viewport para impedir zoom automático e manter o campo com fonte de 16px.
- Organizar a tela em altura dinâmica total: cabeçalho fixo, histórico rolável e campo de mensagem sempre visível acima das barras e do teclado.
- Limitar a largura no desktop sem deixar áreas pretas no celular, respeitando as áreas seguras do aparelho.
- Manter rolagem automática ao carregar, receber e enviar mensagens.

## Envio instantâneo
- Inserir a mensagem imediatamente no histórico e limpar o campo antes da resposta do servidor.
- Manter vários envios independentes, sem bloquear o campo enquanto uma mensagem anterior é processada.
- Substituir a mensagem provisória pela mensagem confirmada sem duplicação.
- Em falha, preservar o texto no histórico e mostrar um indicador vermelho ao lado do balão.

## Validação
- Validar envio, confirmação, falha visual e posição do campo com teclado/altura móvel.
- Conferir o Web Chat em viewport de celular e executar o typecheck completo.
- Manter tudo somente no preview, sem publicação.

## Detalhes técnicos
- Alterações restritas a `src/pages/WebChatPublic.tsx` e à meta viewport de `index.html`.
- O endpoint e a lógica de criação/roteamento das conversas permanecem inalterados.
