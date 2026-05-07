import { useMemo, useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface Channel {
  id: string;
  name: string;
  phone: string;
  provider: string;
  connected: boolean;
  waba_id?: string | null;
  app_name?: string | null;
}

interface Props {
  channels: Channel[];
  selectedChannels: string[];
  toggleChannel: (id: string) => void;
  setSelectedChannels: React.Dispatch<React.SetStateAction<string[]>>;
  setChannelTemplates: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
}

export function ChannelSelectionByAccount({
  channels,
  selectedChannels,
  toggleChannel,
  setSelectedChannels,
  setChannelTemplates,
  setFormData,
}: Props) {
  // Group channels by waba_id (account). Channels without waba_id grouped as "Sem conta".
  const groups = useMemo(() => {
    const map = new Map<string, Channel[]>();
    channels.forEach((c) => {
      const key = c.waba_id || "__no_account__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: key === "__no_account__" ? "Sem conta" : `Conta ${key.slice(-6)}`,
      channels: list,
    }));
  }, [channels]);

  const hasMultipleAccounts = groups.length > 1;
  const [activeTab, setActiveTab] = useState<string>("__all__");

  useEffect(() => {
    if (!hasMultipleAccounts) setActiveTab("__all__");
  }, [hasMultipleAccounts]);

  const visibleChannels = useMemo(() => {
    if (activeTab === "__all__") return channels;
    return groups.find((g) => g.key === activeTab)?.channels || [];
  }, [activeTab, channels, groups]);

  const allVisibleSelected =
    visibleChannels.length > 0 &&
    visibleChannels.every((c) => selectedChannels.includes(c.id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      const remaining = selectedChannels.filter(
        (id) => !visibleChannels.some((c) => c.id === id)
      );
      setSelectedChannels(remaining);
      setChannelTemplates((prev) => {
        const updated = { ...prev };
        visibleChannels.forEach((c) => delete updated[c.id]);
        return updated;
      });
      if (remaining.length === 0) {
        setFormData((prev: any) => ({ ...prev, unifiedTemplate: "" }));
      }
    } else {
      const toAdd = visibleChannels.map((c) => c.id);
      setSelectedChannels(Array.from(new Set([...selectedChannels, ...toAdd])));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-foreground">
          Canais de disparo <span className="text-destructive">*</span>
        </Label>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-primary hover:text-primary/80"
          onClick={toggleAllVisible}
        >
          {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
        </Button>
      </div>

      {hasMultipleAccounts ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto justify-start">
            <TabsTrigger value="__all__" className="text-xs">
              Todas <Badge variant="outline" className="ml-2">{channels.length}</Badge>
            </TabsTrigger>
            {groups.map((g) => {
              const selectedInGroup = g.channels.filter((c) =>
                selectedChannels.includes(c.id)
              ).length;
              return (
                <TabsTrigger key={g.key} value={g.key} className="text-xs">
                  {g.label}
                  <Badge variant="outline" className="ml-2">
                    {selectedInGroup > 0 ? `${selectedInGroup}/` : ""}{g.channels.length}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <TabsContent value={activeTab} className="mt-3">
            <ChannelList
              channels={visibleChannels}
              selectedChannels={selectedChannels}
              toggleChannel={toggleChannel}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <ChannelList
          channels={channels}
          selectedChannels={selectedChannels}
          toggleChannel={toggleChannel}
        />
      )}
    </div>
  );
}

function ChannelList({
  channels,
  selectedChannels,
  toggleChannel,
}: {
  channels: Channel[];
  selectedChannels: string[];
  toggleChannel: (id: string) => void;
}) {
  if (channels.length === 0) {
    return (
      <div className="bg-muted/30 rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        Nenhum canal nesta conta.
      </div>
    );
  }
  return (
    <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-2 max-h-48 overflow-y-auto">
      {channels.map((channel) => (
        <div
          key={channel.id}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
            selectedChannels.includes(channel.id)
              ? "bg-primary/10 border-primary/50"
              : "bg-card border-border hover:border-primary/30"
          )}
          onClick={() => toggleChannel(channel.id)}
        >
          <Checkbox
            checked={selectedChannels.includes(channel.id)}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Smartphone className="w-4 h-4 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{channel.name}</p>
            <p className="text-xs text-muted-foreground">{channel.phone}</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
      ))}
    </div>
  );
}
