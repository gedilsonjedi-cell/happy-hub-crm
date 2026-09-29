# Roadmap

- [x] Remover a redução global da raiz e definir densidade na escala Tailwind.
- [x] Normalizar cores diretas em Atendimento, Disparos e Relatórios.
- [x] Auditar e ajustar dimensões fixas e ícones nas três áreas.
- [x] Validar compilação, raiz em 16px e typecheck; telas autenticadas redirecionaram ao login neste ambiente.
- [x] Reajustar a escala para fator 0,9375 (base 15px) e re-derivar as medidas fixas geradas pelo fator anterior; conferido por CSS computado.


- [x] Mover Dashboard, Templates e Conexões para a barra principal; remover duplicatas de Configurações; validar UI e typecheck.
- [x] Reformular a Dashboard com os dados atuais, gráficos reais, filtro de período, estados vazios e barra lateral modernizada; validar desktop, celular e typecheck.
- [x] Corrigir o carregamento infinito da Dashboard para super admin sem cliente, isolar falhas por módulo, adicionar timeout às consultas e corrigir a ordenação das etapas do Pipeline.
- [x] Eliminar loading infinito com cliente selecionado e unificar tema/fundo em navegação e recarga.

## Web Chat (texto pré-definido + avisos de notificação)

- [x] Campo "Texto Pré-definido do Cliente" no link e caixa do chat já preenchida ao abrir.
- [x] Link curto e limpo `optimuscrm.com.br/c/<código>`: o texto pré-definido sai da URL e passa a ser lido do próprio link.
- [x] Card no chat pedindo para ativar avisos (botão "🔔 Ativar Avisos" + permissão do navegador).
- [x] Guardar a inscrição de notificação do visitante e enviar pelo canal `web_chat`.
- [x] Service Worker na raiz pública com `push` e `notificationclick`.
- [x] Chaves de notificação (VAPID) geradas e guardadas no banco (tabela `webpush_config`, só service_role).
- [x] Cenário "notificações bloqueadas" (`Notification.permission === 'denied'`): em vez de tentar pedir permissão, o card mostra a instrução de recuperação (cadeado 🔒 na barra de endereços), sem botão.
- [ ] Aviso chegando de verdade no celular do visitante (só confere no site publicado).
- [x] Ajustar card de Conexões para tamanho médio, status escrito na frente e grade responsiva; validar sem publicar.

## Web Chat público estilo WhatsApp

- [x] Redesenhar a página pública em tema escuro com doodles, bolhas, cabeçalho e compositor responsivo.
- [x] Manter somente texto, emoji e áudio; implementar gravação, cancelamento e envio com validações.
- [x] Estender e implantar as Edge Functions do Web Chat necessárias para persistir e recarregar áudio na conversa existente.
- [x] Criar testes do componente para aparência, controles, gravação e responsividade.
- [x] Validar desktop/celular com screenshots, suíte, typecheck e build; não publicar o site.
- [x] Corrigir o botão de visualização para abrir a versão nova no preview, mantendo o link copiado apontando para o domínio público.
