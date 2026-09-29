# Ajustar cards de Conexões para tamanho médio

## Objetivo
- Manter o flip, toque no celular e foco pelo teclado já existentes.
- Recuperar um card médio, com mais presença visual e menos itens por linha.
- Alterar apenas a pré-visualização; não publicar.

## Alterações
1. Aplicar ao card a medida anterior encontrada no histórico; se ela não estiver disponível, usar 176px de altura.
2. Reorganizar a frente para exibir status com texto, nome, “WhatsApp Cloud (Oficial)” e telefone.
3. Manter BM, interruptor e engrenagem somente no verso, sem alterar suas ações.
4. Ajustar a grade para 1 coluna no celular, 2 em telas intermediárias, 3 em desktop e 4 apenas em telas largas.
5. Atualizar somente as asserções dos testes afetadas por tamanho e conteúdo.

## Validação
- Executar os testes do card e a suíte do projeto.
- Executar o typecheck solicitado e o build.
- Conferir visualmente o card e a grade em larguras de celular e desktop no preview.
- Se o arquivo de tipos for regenerado de forma incompleta, restaurar sua versão completa antes de concluir.

## Limite
- Nenhuma publicação será feita.
