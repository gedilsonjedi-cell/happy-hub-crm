

# Plano: Adicionar Filtro por Departamento/Setor

## Resumo

Adicionar um novo filtro na tela de Atendimento V2 que permite supervisores e administradores filtrar conversas por departamento/setor, similar ao filtro de atendente já existente.

## O que será feito

1. **Criar componente `SectorFilter`** - Um select dropdown seguindo o mesmo padrão visual do `AttendantFilter`, listando todos os setores da organização

2. **Adicionar estado de filtro** - Novo estado `filterBySector` no `AtendimentoV2` para controlar qual setor está selecionado

3. **Aplicar filtro nas conversas** - Modificar a lógica de filtragem para incluir o filtro de setor em todas as listas (ativas, arquivadas, busca global)

## Detalhes da Implementação

### Componente SectorFilter

O componente será praticamente idêntico ao `AttendantFilter`:
- Select com ícone de departamento (Building2 ou GitBranch)
- Opção "Todos os departamentos" como padrão
- Lista de setores da organização ordenados alfabeticamente

### Integração no AtendimentoV2

- O filtro aparecerá ao lado do filtro de atendente
- Apenas visível para admins e supervisores (mesma condição do filtro de atendente)
- Filtra por `conv.sectorId === selectedSectorId`
- Também incluirá a opção de mostrar conversas "Sem departamento" (organic leads)

---

## Detalhes Técnicos

### Novo arquivo: `src/components/whatsapp/SectorFilter.tsx`

```typescript
interface SectorFilterProps {
  value: string | null;
  onChange: (sectorId: string | null) => void;
}
```

O componente busca setores da organização e renderiza um Select.

### Alterações em `AtendimentoV2.tsx`

1. **Novo estado**:
```typescript
const [filterBySector, setFilterBySector] = useState<string | null>(null);
```

2. **Lógica de filtragem atualizada** (linhas ~2785-2830):
```typescript
// Apply sector filter
const matchesSector = !filterBySector || 
  (filterBySector === "none" ? !conv.sectorId : conv.sectorId === filterBySector);
```

3. **UI** - Adicionar o componente ao lado do filtro de atendente:
```tsx
{canSeeOthers && (
  <SectorFilter 
    value={filterBySector} 
    onChange={setFilterBySector}
  />
)}
```

### Opções do Filtro

- **Todos os departamentos** - Mostra tudo (valor: `null`)
- **Sem departamento** - Mostra apenas conversas orgânicas sem setor (valor: `"none"`)
- **[Nome do Departamento]** - Mostra apenas conversas daquele setor específico

