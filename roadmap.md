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
