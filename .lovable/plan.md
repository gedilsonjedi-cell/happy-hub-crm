# Foto de perfil do Web Chat

## Resultado
- Permitir escolher uma foto para cada link na tela de gerenciamento do Web Chat.
- Mostrar a foto no cabeçalho da conversa pública; quando não houver foto, manter a inicial do nome.
- Permitir trocar ou remover a imagem sem alterar o endereço nem o histórico do link.

## Implementação
- Adicionar ao link apenas o caminho da imagem, mantendo o arquivo em armazenamento privado já existente e separado por organização.
- Validar formato e tamanho antes do envio, exibindo prévia e mensagens claras de erro.
- Fazer a função pública de inicialização gerar uma URL temporária da foto, sem liberar leitura pública do armazenamento.
- Atualizar a janela de edição do link com os controles de selecionar, trocar e remover foto.
- Atualizar e implantar somente a função `webchat-init`, necessária para entregar a foto ao cliente final; o site continuará apenas no preview.

## Validação
- Testar foto configurada, fallback com inicial e remoção.
- Rodar testes, typecheck e build, preservando o arquivo completo de tipos.
