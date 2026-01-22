import { useState, useEffect } from "react";
import { Check, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveOrganizationId } from "@/hooks/useEffectiveOrganizationId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  className?: string;
  allowCreate?: boolean;
}

// Generate a random color for new tags
const generateRandomColor = () => {
  const colors = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
    "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
    "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
    "#ec4899", "#f43f5e"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export function TagSelector({ 
  selectedTags, 
  onTagsChange, 
  className,
  allowCreate = true 
}: TagSelectorProps) {
  const { user } = useAuth();
  const { effectiveOrganizationId } = useEffectiveOrganizationId();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchTags = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Use effectiveOrganizationId if available, otherwise fetch from profile
      let orgId = effectiveOrganizationId;
      
      if (!orgId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single();

        if (!profile?.organization_id) {
          console.warn("TagSelector: No organization_id found for user");
          setLoading(false);
          return;
        }
        orgId = profile.organization_id;
      }

      const { data, error } = await supabase
        .from("lead_tags")
        .select("id, name, color")
        .eq("organization_id", orgId)
        .order("name");

      if (error) {
        console.error("TagSelector: Error fetching tags:", error);
      }

      if (data) {
        setTags(data);
      }
    } catch (error) {
      console.error("TagSelector: Unexpected error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, [user, effectiveOrganizationId]);

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onTagsChange(selectedTags.filter(t => t !== tagName));
    } else {
      onTagsChange([...selectedTags, tagName]);
    }
  };

  const handleCreateTag = async () => {
    const trimmedName = newTagName.trim();
    if (!trimmedName) {
      toast.error("Digite um nome para a tag");
      return;
    }

    // Check if tag already exists
    if (tags.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
      toast.error("Já existe uma tag com esse nome");
      return;
    }

    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    setCreating(true);

    try {
      let orgId = effectiveOrganizationId;
      
      if (!orgId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single();

        if (!profile?.organization_id) {
          toast.error("Organização não encontrada");
          setCreating(false);
          return;
        }
        orgId = profile.organization_id;
      }

      const newColor = generateRandomColor();
      
      const { data, error } = await supabase
        .from("lead_tags")
        .insert({
          organization_id: orgId,
          name: trimmedName,
          color: newColor
        })
        .select("id, name, color")
        .single();

      if (error) {
        console.error("Error creating tag:", error);
        toast.error("Erro ao criar tag");
        return;
      }

      if (data) {
        // Add to local state
        setTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        // Auto-select the new tag
        onTagsChange([...selectedTags, data.name]);
        setNewTagName("");
        toast.success(`Tag "${data.name}" criada!`);
      }
    } catch (error) {
      console.error("Unexpected error creating tag:", error);
      toast.error("Erro ao criar tag");
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateTag();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando tags...
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Create new tag input */}
      {allowCreate && (
        <div className="flex gap-2">
          <Input
            placeholder="Nova tag..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
            disabled={creating}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCreateTag}
            disabled={creating || !newTagName.trim()}
            className="h-8 px-3"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>
      )}

      {tags.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {allowCreate 
            ? "Nenhuma tag criada. Digite acima para criar." 
            : "Nenhuma tag criada. Crie tags em Personalização → Tags."}
        </div>
      ) : (
        <ScrollArea className="max-h-48">
          <div className="flex flex-wrap gap-2 p-1">
            {tags.map((tag) => {
              const isSelected = selectedTags.includes(tag.name);
              return (
                <Button
                  key={tag.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleTag(tag.name)}
                  className={cn(
                    "h-7 gap-1.5 transition-all",
                    isSelected && "ring-2 ring-primary ring-offset-1"
                  )}
                  style={{
                    backgroundColor: isSelected ? tag.color + "20" : "transparent",
                    borderColor: tag.color,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-xs">{tag.name}</span>
                  {isSelected && <Check className="w-3 h-3 text-primary" />}
                </Button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
