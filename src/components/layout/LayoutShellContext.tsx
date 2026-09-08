import { createContext, useContext } from "react";

/**
 * Indica que o shell persistente (barra lateral + header) já está montado
 * acima na árvore. Páginas que renderizam <MainLayout>/<TopNavLayout>
 * viram pass-through, evitando remount da barra lateral a cada navegação.
 */
export const LayoutShellContext = createContext(false);

export function useInsideLayoutShell() {
  return useContext(LayoutShellContext);
}
