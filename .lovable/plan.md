# Personalizar o Web Chat público

## Escopo identificado
- Alterar somente a experiência pública das rotas `/chat/:linkId` e `/c/:linkId`, renderizadas por `src/pages/WebChatPublic.tsx`.
- Preservar sessão, identificador `webchat:<uuid>`, distribuição, Radar, Presence, notificações e resposta do atendente.
- Não modificar a tela de Atendimento do agente nem publicar.

## Interface
- Recriar o chat em tema escuro inspirado no WhatsApp Web: cabeçalho fixo, fundo com doodles discretos, bolhas verde/cinza com rabicho, horário e checks.
- Manter o painel em largura confortável no desktop e tela cheia no celular, respeitando teclado e áreas seguras.
- Substituir a barra inferior pela composição com emoji, texto e microfone/enviar; não oferecer imagem, vídeo ou documento.
- O ícone de anexo não será exibido, pois nenhum anexo além de áudio permanecerá disponível.

## Texto, emoji e áudio
- Manter o envio otimista de texto e a conexão atual com `webchat-send`.
- Adicionar seletor compacto de emojis que insere no ponto atual do texto.
- Reutilizar a captura segura de microfone já usada no sistema, com contador, cancelar e enviar.
- Estender o mesmo endpoint público para aceitar exclusivamente áudio, validando tipo, tamanho e duração razoáveis; salvar no storage externo já usado pelo histórico e persistir como mensagem `audio` na mesma conversa.
- Exibir áudio enviado e recebido no histórico com player nativo, sem habilitar outros formatos.

## Testes e validação
- Criar teste do componente para bolhas, doodles, controles permitidos e fluxo iniciar/cancelar/enviar áudio.
- Validar larguras de desktop e celular em teste e por screenshots headless com uma mensagem enviada e uma recebida.
- Executar a suíte de testes, `npx tsgo --noEmit -p tsconfig.app.json` e conferir o build automático.
- Se `src/integrations/supabase/types.ts` for truncado, restaurar a versão completa do histórico.

## Limites
- A nova mídia será somente áudio, com limite de 10 MB e gravação máxima de 5 minutos.
- A atualização da Edge Function necessária para o áudio será preparada no código, mas não implantada nem publicada sem autorização explícita.
