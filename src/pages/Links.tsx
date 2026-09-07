import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Link2, Plus, Trash2, Copy, ExternalLink, BarChart3, Shuffle, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";



interface Destination {
  phone: string;
  message: string;
}

type LinkType = "external_redirect" | "multi_number";

interface RedirectLink {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  destinations: Destination[];
  click_count: number;
  created_at: string;
  link_type: LinkType;
  original_url: string | null;
}

const isValidHttpUrl = (value: string) => {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const Links = () => {
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const { effectiveOrganizationId: organizationId } = useEffectiveOrganizationId();
  const [links, setLinks] = useState<RedirectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<RedirectLink | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [destinations, setDestinations] = useState<Destination[]>([{ phone: "", message: "" }]);
  const [linkType, setLinkType] = useState<LinkType>("multi_number");
  const [originalUrl, setOriginalUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const baseUrl = "https://optimuscrm.com.br";

  useEffect(() => {
    if (organizationId) fetchLinks();
  }, [organizationId]);

  // Realtime subscription for click count updates
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel('redirect-links-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'redirect_links',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setLinks(prev => prev.map(l =>
            l.id === updated.id
              ? { ...l, click_count: updated.click_count, is_active: updated.is_active }
              : l
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  const fetchLinks = async () => {
    let query = supabase
      .from("redirect_links")
      .select("*")
      .order("created_at", { ascending: false });

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;

    if (!error && data) {
      setLinks(data.map((l: any) => ({
        ...l,
        destinations: (l.destinations as Destination[]) || [],
        link_type: (l.link_type as LinkType) || "multi_number",
        original_url: l.original_url ?? null,
      })));
    }
    setLoading(false);
  };

  const generateSlug = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSlug(result);
  };

  const addDestination = () => {
    setDestinations([...destinations, { phone: "", message: "" }]);
  };

  const removeDestination = (index: number) => {
    if (destinations.length <= 1) return;
    setDestinations(destinations.filter((_, i) => i !== index));
  };

  const updateDestination = (index: number, field: keyof Destination, value: string) => {
    const updated = [...destinations];
    updated[index] = { ...updated[index], [field]: value };
    setDestinations(updated);
  };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error("Preencha o nome e o slug do link");
      return;
    }

    const isExternal = linkType === "external_redirect";
    const validDestinations = destinations.filter(d => d.phone.trim());

    if (isExternal) {
      if (!isValidHttpUrl(originalUrl)) {
        toast.error("Informe um link válido começando com http:// ou https://");
        return;
      }
    } else if (validDestinations.length === 0) {
      toast.error("Adicione pelo menos um número de destino");
      return;
    }

    if (!organizationId || !user?.id) {
      toast.error("Erro de autenticação. Recarregue a página.");
      return;
    }

    setSaving(true);

    if (!editingLink) {
      const { data: existing } = await supabase
        .from("redirect_links")
        .select("id")
        .eq("slug", slug.trim().toLowerCase())
        .maybeSingle();
      if (existing) {
        toast.error("Este slug já está em uso. Escolha outro.");
        setSaving(false);
        return;
      }
    }

    if (editingLink) {
      // Update existing link — slug, URL e modo permanecem
      const { error } = await supabase
        .from("redirect_links")
        .update({
          name: name.trim(),
          destinations: isExternal ? ([] as any) : (validDestinations as any),
          original_url: isExternal ? originalUrl.trim() : null,
        })
        .eq("id", editingLink.id);


      if (error) {
        toast.error("Erro ao atualizar link: " + error.message);
      } else {
        toast.success("Link atualizado com sucesso!");
        setDialogOpen(false);
        resetForm();
        fetchLinks();
      }
    } else {
      // Create new link
      const { error } = await supabase.from("redirect_links").insert({
        organization_id: organizationId,
        created_by: user.id,
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        destinations: (isExternal ? [] : validDestinations) as any,
        link_type: linkType,
        original_url: isExternal ? originalUrl.trim() : null,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("Este slug já está em uso. Escolha outro.");
        } else {
          toast.error("Erro ao criar link: " + error.message);
        }
      } else {
        toast.success("Link criado com sucesso!");
        setDialogOpen(false);
        resetForm();
        fetchLinks();
      }
    }
    setSaving(false);
  };

  const resetForm = () => {
    setName("");
    setSlug("");
    setDestinations([{ phone: "", message: "" }]);
    setLinkType("multi_number");
    setOriginalUrl("");
    setEditingLink(null);
  };

  const openEditDialog = (link: RedirectLink) => {
    setEditingLink(link);
    setName(link.name);
    setSlug(link.slug);
    setLinkType(link.link_type || "multi_number");
    setOriginalUrl(link.original_url || "");
    setDestinations(link.destinations.length > 0 ? [...link.destinations] : [{ phone: "", message: "" }]);
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    generateSlug();
    setDialogOpen(true);
  };

  const toggleActive = async (link: RedirectLink) => {
    const { error } = await supabase
      .from("redirect_links")
      .update({ is_active: !link.is_active })
      .eq("id", link.id);

    if (!error) {
      setLinks(links.map(l => l.id === link.id ? { ...l, is_active: !l.is_active } : l));
    }
  };

  const deleteLink = async (id: string) => {
    const { error } = await supabase.from("redirect_links").delete().eq("id", id);
    if (!error) {
      setLinks(links.filter(l => l.id !== id));
      toast.success("Link removido");
    }
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${baseUrl}/r/${slug}`);
    toast.success("Link copiado!");
  };

  const isEditing = !!editingLink;

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link2 className="w-6 h-6 text-primary" />
              Links de Redirecionamento
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Crie links encurtados para redirecionar clientes ao WhatsApp
            </p>
          </div>

          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Link
          </Button>
        </div>



        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? "Editar Link" : "Criar Link de Redirecionamento"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Nome do Link</Label>
                <Input
                  placeholder="Ex: Campanha Janeiro"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div>
                <Label>Slug (identificador do link)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="ex: campanha-jan"
                    value={slug}
                    onChange={e => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                    disabled={isEditing}
                  />
                  {!isEditing && (
                    <Button variant="outline" size="sm" onClick={generateSlug}>
                      <Shuffle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Link: {baseUrl}/r/{slug || "..."}
                  {isEditing && <span className="ml-2 text-primary">(a URL não será alterada)</span>}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Destinos WhatsApp</Label>
                  <Button variant="ghost" size="sm" onClick={addDestination}>
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Com múltiplos destinos, o redirecionamento será aleatório entre eles.
                </p>

                {destinations.map((dest, index) => (
                  <Card key={index} className="relative">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Destino {index + 1}
                        </span>
                        {destinations.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeDestination(index)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Número (com DDI)</Label>
                        <Input
                          placeholder="5511999999999"
                          value={dest.phone}
                          onChange={e => updateDestination(index, "phone", e.target.value.replace(/\D/g, ""))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Mensagem pré-definida (opcional)</Label>
                        <Textarea
                          placeholder="Olá, vim pelo link..."
                          value={dest.message}
                          onChange={e => updateDestination(index, "message", e.target.value)}
                          rows={2}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? (isEditing ? "Salvando..." : "Criando...") : (isEditing ? "Salvar Alterações" : "Criar Link")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : links.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Link2 className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum link criado ainda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {links.map(link => (
              <Card key={link.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{link.name}</h3>
                        <Badge variant={link.is_active ? "default" : "secondary"}>
                          {link.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        {link.destinations.length > 1 && (
                          <Badge variant="outline" className="gap-1">
                            <Shuffle className="w-3 h-3" />
                            {link.destinations.length} destinos
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <code className="bg-muted px-2 py-0.5 rounded text-xs">
                          {baseUrl}/r/{link.slug}
                        </code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyLink(link.slug)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <a href={`${baseUrl}/r/${link.slug}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                        </a>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          {link.click_count} cliques
                        </span>
                        <span>
                          {link.destinations.map(d => d.phone).join(", ")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(link)}
                        title="Editar link"
                      >
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Switch
                        checked={link.is_active}
                        onCheckedChange={() => toggleActive(link)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLink(link.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Links;
