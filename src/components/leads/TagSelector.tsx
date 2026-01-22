import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  className?: string;
}

export function TagSelector({ selectedTags, onTagsChange, className }: TagSelectorProps) {
  const { user } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTags = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
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

        const { data, error } = await supabase
          .from("lead_tags")
          .select("id, name, color")
          .eq("organization_id", profile.organization_id)
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

    fetchTags();
  }, [user]);

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onTagsChange(selectedTags.filter(t => t !== tagName));
    } else {
      onTagsChange([...selectedTags, tagName]);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando tags...</div>;
  }

  if (tags.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Nenhuma tag criada. Crie tags em Personalização → Tags.
      </div>
    );
  }

  return (
    <ScrollArea className={cn("max-h-48", className)}>
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
  );
}
