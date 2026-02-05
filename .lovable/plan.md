
# Plano: Correção Definitiva do Envio de Áudio no WhatsApp

## Diagnóstico do Problema

Analisando os logs do console, identifiquei a causa raiz:

```
[AudioRecording] OpusMediaRecorder failed, falling back to WebM: SecurityError
[FFmpeg] Failed to load: Error: failed to import ffmpeg-core.js  
[AudioRecording] Recording completed: { format: "audio/webm;codecs=opus", size: 30891 }
```

**O que está acontecendo:**
1. O navegador (Chrome/Edge) não suporta gravação nativa em OGG
2. O polyfill `opus-media-recorder` falha por causa de CORS (Worker externo bloqueado)
3. O FFmpeg.wasm também falha ao carregar
4. O sistema grava em **WebM** mas salva com extensão **.opus**
5. A Meta API rejeita porque o arquivo não é um OGG/Opus válido - é WebM disfarçado

---

## Solução Proposta

Como a conversão no navegador falha e você confirmou que **enviar mídia manualmente funciona**, a solução é usar a **Edge Function `convert-audio`** para fazer a conversão no servidor usando a API do Zamzar (já configurada).

### Etapa 1: Modificar o Hook de Gravação

**Arquivo:** `src/hooks/useAudioRecording.tsx`

**Mudanças:**
- Remover tentativa de usar `opus-media-recorder` (sempre falha por CORS)
- Sempre gravar em WebM (formato nativo do Chrome/Edge)
- Retornar flag indicando que conversão no servidor é necessária

### Etapa 2: Atualizar a Edge Function `convert-audio`

**Arquivo:** `supabase/functions/convert-audio/index.ts`

**Mudanças:**
- Usar a API do Zamzar (secret já configurada) para converter WebM para OGG/Opus
- Salvar com extensão `.opus` no storage
- Retornar a URL pública do arquivo convertido

**Fluxo da conversão:**
```
Browser grava WebM → Upload para Supabase Storage → 
Edge Function baixa → Envia para Zamzar → 
Recebe OGG convertido → Salva como .opus no Storage →
Retorna URL pública
```

### Etapa 3: Atualizar AtendimentoV2 para Usar a Edge Function

**Arquivo:** `src/pages/AtendimentoV2.tsx`

**Mudanças na função `handleSendVoiceRecording`:**
1. Gravar áudio normalmente (será WebM)
2. Converter para base64
3. Chamar Edge Function `convert-audio` com o áudio
4. Receber URL do arquivo já convertido (.opus)
5. Enviar via `handleSendMedia` (mesmo método usado pelo upload manual)

```
Usuário grava → Blob WebM → Base64 → 
Edge Function convert-audio → Zamzar API → 
OGG/Opus no Storage → URL pública → 
handleSendMedia → meta-send → WhatsApp
```

### Etapa 4: Adicionar Feedback Visual

- Mostrar "Processando áudio..." durante a conversão no servidor
- Toast informativo em caso de erro
- Timeout de 30 segundos para a conversão

---

## Detalhes Técnicos

### Formato do Request para convert-audio

```typescript
const response = await supabase.functions.invoke('convert-audio', {
  body: {
    audioData: base64AudioData, // WebM em base64
    mimeType: 'audio/webm',
    organizationId: organizationId
  }
});
```

### Resposta esperada

```json
{
  "success": true,
  "convertedUrl": "https://...supabase.co/.../audio_123.opus",
  "originalFormat": "audio/webm"
}
```

### Por que usar Zamzar no servidor?

1. **Funciona de forma confiável** - serviço especializado em conversão
2. **Secret já configurada** - `ZAMZAR_API_KEY` já existe no projeto
3. **Sem limitações de CORS** - Edge Functions não têm restrições de browser
4. **Formatos garantidos** - Zamzar suporta WebM → OGG/Opus nativamente

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAudioRecording.tsx` | Simplificar - sempre WebM, sem polyfills |
| `supabase/functions/convert-audio/index.ts` | Integrar API Zamzar para conversão real |
| `src/pages/AtendimentoV2.tsx` | Chamar Edge Function antes de enviar |

---

## Resultado Esperado

- Gravação funciona em todos os navegadores (WebM nativo)
- Conversão feita no servidor com Zamzar (100% confiável)
- Arquivo salvo como .opus real (não WebM disfarçado)
- Envio via meta-send funciona normalmente
- Mesmo fluxo do upload manual (que você confirmou funcionar)
