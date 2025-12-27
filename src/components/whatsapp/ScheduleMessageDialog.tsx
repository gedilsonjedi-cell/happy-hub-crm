import { useState } from "react";
import { Calendar, Clock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, addHours, setHours, setMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ScheduleMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (data: {
    message: string;
    scheduledAt: Date;
  }) => void;
  contactName?: string | null;
}

export const ScheduleMessageDialog = ({ 
  isOpen, 
  onClose, 
  onSchedule,
  contactName 
}: ScheduleMessageDialogProps) => {
  const [message, setMessage] = useState("");
  const [date, setDate] = useState<Date | undefined>(addHours(new Date(), 1));
  const [time, setTime] = useState("12:00");
  const [scheduling, setScheduling] = useState(false);

  const handleSchedule = async () => {
    if (!message.trim()) {
      toast.error("Digite a mensagem a ser agendada");
      return;
    }

    if (!date) {
      toast.error("Selecione uma data");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const scheduledDate = setMinutes(setHours(date, hours), minutes);

    if (scheduledDate <= new Date()) {
      toast.error("A data/hora deve ser no futuro");
      return;
    }

    setScheduling(true);
    
    try {
      await onSchedule({
        message: message.trim(),
        scheduledAt: scheduledDate,
      });
      
      toast.success("Mensagem agendada com sucesso!", {
        description: `Será enviada em ${format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });
      
      resetForm();
      onClose();
    } catch (error) {
      toast.error("Erro ao agendar mensagem");
    } finally {
      setScheduling(false);
    }
  };

  const resetForm = () => {
    setMessage("");
    setDate(addHours(new Date(), 1));
    setTime("12:00");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Agendar Mensagem
          </DialogTitle>
          <DialogDescription>
            {contactName 
              ? `Agendar mensagem para ${contactName}`
              : "Agendar mensagem para esta conversa"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              placeholder="Digite a mensagem que será enviada..."
              className="min-h-[100px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-popover" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Hora</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {date && time && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-primary">
                <strong>Envio programado:</strong>{" "}
                {format(
                  setMinutes(setHours(date, parseInt(time.split(":")[0])), parseInt(time.split(":")[1])),
                  "EEEE, dd 'de' MMMM 'às' HH:mm",
                  { locale: ptBR }
                )}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSchedule} disabled={!message.trim() || !date || scheduling}>
            {scheduling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Agendando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Agendar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
