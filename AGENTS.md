# Regras de arquitetura

- A densidade visual deve ser definida pelas escalas `fontSize` e `spacing` do Tailwind, mantendo a raiz do navegador em 16px, para preservar a proporção entre texto, ícones, gráficos e medidas fixas.
- Estados funcionais e séries visuais devem usar tokens semânticos (`success`, `warning`, `info`, `neutral` e `chart`) em vez de famílias de cor diretas, para manter consistência entre temas.
- A Dashboard deve derivar KPIs e gráficos das mesmas definições de status e da organização efetiva, usando Recharts e estados vazios sem dados artificiais, para manter coerência visual e numérica.