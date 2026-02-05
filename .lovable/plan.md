
# Plano: Correção do Envio de Áudio no WhatsApp

## Problema Identificado

O envio de áudios está falhando porque:

1. Navegadores como Chrome e Firefox gravam áudio no formato **WebM**, que não é aceito pela API do WhatsApp
2. A conversão atual depende de APIs externas (CloudConvert/Zamzar) que **não estão configuradas**
3. Existe uma biblioteca de conversão no frontend (FFmpeg.wasm) que não está sendo utilizada

## Solução

Implementar conversão de áudio **diretamente no navegador** usando FFmpeg.wasm (que já está instalado no projeto), eliminando a necessidade de APIs externas pagas.

---

## Etapas de Implementação

### 1. Atualizar Hook de Gravação de Áudio

**Arquivo:** `src/hooks/useAudioRecording.tsx`

- Melhorar detecção de formato suportado
- Adicionar flag indicando se conversão será necessária
- Retornar informações mais detalhadas sobre o formato gravado

### 2. Corrigir Biblioteca de Conversão FFmpeg

**Arquivo:** `src/lib/audioConverter.ts`

- Verificar e corrigir a função `convertToOgg` existente
- Adicionar tratamento de erros robusto
- Adicionar logs para debug
- Garantir compatibilidade com diferentes navegadores

### 3. Integrar Conversão Client-Side no AtendimentoV2

**Arquivo:** `src/pages/AtendimentoV2.tsx`

Atualizar a função `handleSendVoiceRecording` para:
1. Detectar se o áudio gravado está em formato WebM
2. Converter para OGG/Opus usando FFmpeg.wasm no navegador
3. Fazer upload do arquivo já convertido
4. Remover dependência da edge function `convert-audio`

**Novo fluxo:**
```
Usuário grava áudio
    ↓
Formato é WebM? ────── NÃO ───→ Enviar diretamente
    │
   SIM
    ↓
Converter para OGG (FFmpeg no browser)
    ↓
Upload do arquivo OGG
    ↓
Enviar via meta-send/zapi-send
```

### 4. Adicionar Feedback Visual

- Mostrar indicador de "Convertendo áudio..." durante a conversão
- Toast informativo quando conversão for necessária
- Tratamento de erros com mensagens claras

### 5. Pré-carregar FFmpeg (Otimização)

- Carregar FFmpeg.wasm em background ao abrir a página de atendimento
- Isso evita delay na primeira gravação

---

## Detalhes Técnicos

### Conversão de Áudio no Browser

O FFmpeg.wasm permite conversão de áudio diretamente no navegador:
- WebM → OGG/Opus (formato preferido pelo WhatsApp)
- Sem necessidade de servidor ou APIs externas
- Funciona em Chrome, Firefox, Safari e Edge

### Formatos Aceitos pelo WhatsApp

- `audio/ogg` (preferido)
- `audio/mpeg` (mp3)
- `audio/mp4` (m4a)
- `audio/aac`

### Estimativa de Tempo

A conversão de um áudio de 1 minuto leva aproximadamente 2-5 segundos no navegador moderno.

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAudioRecording.tsx` | Melhorar detecção de formato |
| `src/lib/audioConverter.ts` | Corrigir e otimizar conversão |
| `src/pages/AtendimentoV2.tsx` | Integrar conversão client-side |

---

## Resultado Esperado

- Áudios gravados em qualquer navegador serão enviados com sucesso
- Sem dependência de APIs externas pagas
- Conversão rápida e transparente para o usuário
- Feedback visual durante o processo
