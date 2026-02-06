
# Plano: Sistema de Contingência para Migração de WABA

## Entendimento do Problema

Quando um WABA (WhatsApp Business Account) é restrito pela Meta, você transfere os números para outro WABA. Hoje, para refletir isso no sistema:
- Você precisa **excluir** o canal e **recriá-lo** com o novo WABA
- Isso gera um novo `channel_id`, quebrando o vínculo com mensagens e conversas
- O cliente perde o histórico e a experiência é interrompida

## Solução Proposta

### Nova Funcionalidade: "Migrar WABA"

Adicionar um botão no menu de ações de cada canal Meta que permite **trocar o WABA** sem perder o histórico:

```text
┌─────────────────────────────────────────┐
│  Canal: L&P Financeira (+55 21 9204...) │
│  WABA: 925630689888926                  │
├─────────────────────────────────────────┤
│  ⋮ Menu                                 │
│  ├── 🔄 Reconectar                      │
│  ├── 🔧 Ver Configuração                │
│  ├── 🤖 Vincular Chatbot                │
│  ├── 🔀 Migrar WABA  ← NOVO             │
│  └── 🗑️ Excluir                         │
└─────────────────────────────────────────┘
```

### Fluxo da Migração

1. **Usuário clica "Migrar WABA"**
   - Abre modal solicitando:
     - Novo WABA ID
     - Novo Access Token

2. **Sistema valida o novo WABA**
   - Busca números do novo WABA via Meta API
   - Verifica se o número do canal existe no novo WABA

3. **Atualiza o canal existente**
   - Atualiza `waba_id` com o novo ID
   - Atualiza `access_token` com o novo token
   - Atualiza `app_name` (Phone Number ID) se necessário
   - Gera novo `webhook_verify_token`

4. **Re-registra no Meta**
   - Chama `meta-register-phone` para ativar no novo WABA
   - Chama `meta-subscribe-webhook` para inscrever webhook

5. **Histórico preservado**
   - O `channel_id` permanece o mesmo
   - Todas as mensagens e conversas continuam vinculadas
   - Cliente continua a conversa normalmente

## Arquivos a Modificar

### 1. `src/pages/Conexoes.tsx`
- Adicionar estado para modal de migração (`showMigrateWabaDialog`)
- Criar função `handleMigrateWaba` que:
  - Valida novas credenciais com Meta API
  - Encontra o Phone Number ID correto no novo WABA
  - Atualiza o canal no banco
  - Re-registra e inscreve webhook
- Adicionar item "Migrar WABA" no DropdownMenu de cada canal Meta

### 2. Componente do Modal de Migração
Campos:
- Novo WABA ID (obrigatório)
- Novo Access Token (obrigatório)

Botões:
- "Cancelar"
- "Validar e Migrar" (busca números, valida, executa migração)

## Detalhes Técnicos

### Lógica de Migração (pseudocódigo)

```typescript
async function handleMigrateWaba(channel, newWabaId, newAccessToken) {
  // 1. Buscar números do novo WABA
  const phones = await fetchPhonesFromMeta(newWabaId, newAccessToken);
  
  // 2. Encontrar o número do canal no novo WABA
  const matchingPhone = phones.find(p => 
    normalizePhone(p.displayPhoneNumber) === normalizePhone(channel.phone)
  );
  
  if (!matchingPhone) {
    throw new Error("Número não encontrado no novo WABA");
  }
  
  // 3. Atualizar canal (mantém mesmo channel_id!)
  await supabase.from("channels").update({
    waba_id: newWabaId,
    access_token: newAccessToken,
    app_name: matchingPhone.id, // Novo Phone Number ID
    webhook_verify_token: generateNewToken(),
    connected: false, // Será ativado após registro
  }).eq("id", channel.id);
  
  // 4. Registrar número no Meta
  await registerPhoneWithMeta(matchingPhone.id, newAccessToken);
  
  // 5. Inscrever webhook
  await subscribeWebhook(newWabaId, matchingPhone.id, newAccessToken);
  
  // 6. Marcar como conectado
  await supabase.from("channels").update({ connected: true }).eq("id", channel.id);
}
```

### Validações de Segurança

- Verificar se o número realmente existe no novo WABA antes de migrar
- Confirmar que o usuário tem permissão para modificar o canal
- Manter backup das credenciais antigas caso precise reverter

## Benefícios

1. **Zero downtime** - Cliente não percebe a troca
2. **Histórico preservado** - Todas as mensagens e conversas mantidas
3. **Fluxo simples** - Apenas inserir novo WABA ID e token
4. **Automatizado** - Sistema encontra automaticamente o Phone Number ID correto
5. **Contingência rápida** - Resposta imediata quando WABA é restrito

## Estimativa

- **Complexidade**: Média
- **Arquivos**: 1 (Conexoes.tsx)
- **Componentes novos**: 1 modal

## Interface Visual Proposta

```text
┌────────────────────────────────────────────────────┐
│  🔀 Migrar WABA                                    │
├────────────────────────────────────────────────────┤
│                                                    │
│  Canal: L&P Financeira                             │
│  Número: +55 21 92041-8100                         │
│  WABA Atual: 925630689888926                       │
│                                                    │
│  ─────────────────────────────────────────────     │
│                                                    │
│  Novo WABA ID *                                    │
│  ┌────────────────────────────────────────┐        │
│  │                                        │        │
│  └────────────────────────────────────────┘        │
│                                                    │
│  Novo Access Token *                               │
│  ┌────────────────────────────────────────┐ 👁️    │
│  │ ••••••••••••••••••••••••••••••••       │        │
│  └────────────────────────────────────────┘        │
│                                                    │
│  ⚠️ O número (+55 21 92041-8100) deve existir      │
│     no novo WABA para a migração funcionar.        │
│                                                    │
│  ─────────────────────────────────────────────     │
│                                                    │
│            [Cancelar]    [Validar e Migrar]        │
│                                                    │
└────────────────────────────────────────────────────┘
```

Após aprovação, implementarei esta funcionalidade mantendo a consistência com o código existente.
