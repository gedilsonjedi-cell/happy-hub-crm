# Regras de arquitetura

- A densidade visual deve ser definida pelas escalas `fontSize` e `spacing` do Tailwind, mantendo a raiz do navegador em 16px, para preservar a proporção entre texto, ícones, gráficos e medidas fixas.
- Estados funcionais e séries visuais devem usar tokens semânticos (`success`, `warning`, `info`, `neutral` e `chart`) em vez de famílias de cor diretas, para manter consistência entre temas.
- A Dashboard deve derivar KPIs e gráficos das mesmas definições de status e da organização efetiva, usando Recharts e estados vazios sem dados artificiais, para manter coerência visual e numérica.
- Consultas da Dashboard devem ter timeout e falhar por módulo; ausência de organização efetiva encerra o carregamento e solicita seleção de cliente, evitando bloqueio global da página.
- A seleção de organização persistida libera imediatamente o contexto efetivo; consultas auxiliares de cargo/lista têm timeout e nunca bloqueiam a Dashboard.
- `html`, `body`, `#root` e o shell principal usam `--app-background`; o tema é aplicado antes do React para impedir flash claro/escuro.- Fotos de contato ficam no bucket privado `contact-avatars` (`{org}/{lead}/{ts}.webp`, `leads.avatar_path`), exibidas por URL assinada em lote via `src/lib/contactAvatars.ts`, porque são dado pessoal (LGPD) e evitam uma requisição por card.
- O Web Chat público aceita somente texto, emoji e áudio (máximo 10 MB/5 min) pelo `webchat-send`; outros anexos permanecem indisponíveis para reduzir abuso no endpoint anônimo.
