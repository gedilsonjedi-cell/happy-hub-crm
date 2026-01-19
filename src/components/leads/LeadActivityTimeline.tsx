import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Send, 
  MessageSquare, 
  ArrowRight, 
  Tag, 
  X, 
  StickyNote, 
  Megaphone, 
  Clock, 
  UserCheck, 
  MessageCircle, 
  CheckCircle, 
  Edit,
  Loader2
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LeadActivity, activityTypeConfig } from "@/hooks/useLeadActivityLog";

interface LeadActivityTimelineProps {
  activities: LeadActivity[];
  loading?: boolean;
  maxHeight?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Send,
  MessageSquare,
  ArrowRight,
  Tag,
  X,
  StickyNote,
  Megaphone,
  Clock,
  UserCheck,
  MessageCircle,
  CheckCircle,
  Edit,
};

export function LeadActivityTimeline({ activities, loading, maxHeight = "400px" }: LeadActivityTimelineProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm">Nenhuma atividade registrada</p>
      </div>
    );
  }

  return (
    <ScrollArea className="pr-4" style={{ maxHeight }}>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-4">
          {activities.map((activity, index) => {
            const config = activityTypeConfig[activity.activity_type] || {
              icon: "MessageSquare",
              color: "text-muted-foreground",
              label: activity.activity_type,
            };
            const IconComponent = iconMap[config.icon] || MessageSquare;

            return (
              <div key={activity.id} className="relative flex gap-4 pl-0">
                {/* Icon */}
                <div className={cn(
                  "relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-background border-2 border-border",
                  index === 0 && "border-primary"
                )}>
                  <IconComponent className={cn("w-4 h-4", config.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {activity.title}
                      </p>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                    </div>
                    <time className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(activity.created_at), "dd MMM, HH:mm", { locale: ptBR })}
                    </time>
                  </div>

                  {/* Metadata badges */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {config.label}
                    </Badge>
                    
                    {activity.performer_name && (
                      <Badge variant="secondary" className="text-xs">
                        por {activity.performer_name}
                      </Badge>
                    )}

                    {activity.campaign_name && (
                      <Badge variant="secondary" className="text-xs bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                        {activity.campaign_name}
                      </Badge>
                    )}

                    {activity.metadata?.from_stage && activity.metadata?.to_stage && (
                      <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/20">
                        {String(activity.metadata.from_stage)} → {String(activity.metadata.to_stage)}
                      </Badge>
                    )}

                    {activity.metadata?.tag_name && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: `${activity.metadata.tag_color as string || '#6b7280'}20`,
                          color: activity.metadata.tag_color as string || '#6b7280',
                          borderColor: `${activity.metadata.tag_color as string || '#6b7280'}40`,
                        }}
                      >
                        {String(activity.metadata.tag_name)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
