import { useEffect, useReducer, useState } from "react";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  getCachedSignedUrl,
  getPathForPhone,
  requestPhoneAvatar,
  requestSignedUrl,
  subscribeAvatars,
} from "@/lib/contactAvatars";

export function getContactInitials(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ContactAvatarProps {
  name: string | null | undefined;
  /** Caminho já conhecido (ex.: linha de leads). `undefined` = resolver pelo telefone. */
  avatarPath?: string | null;
  phone?: string | null;
  organizationId?: string | null;
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
}

export function ContactAvatar({
  name,
  avatarPath,
  phone,
  organizationId,
  className,
  fallbackClassName = "bg-primary/10 text-primary",
  iconClassName = "w-4 h-4",
}: ContactAvatarProps) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeAvatars(force), []);

  const resolvedPath =
    avatarPath !== undefined ? avatarPath : getPathForPhone(organizationId, phone) ?? null;

  useEffect(() => {
    if (avatarPath === undefined && organizationId && phone) requestPhoneAvatar(organizationId, phone);
  }, [avatarPath, organizationId, phone]);

  useEffect(() => {
    if (resolvedPath) requestSignedUrl(resolvedPath);
  }, [resolvedPath]);

  const url = getCachedSignedUrl(resolvedPath);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!url && failedUrl !== url;
  const initials = getContactInitials(name);

  return (
    <Avatar className={className}>
      {showImage && (
        <AvatarImage
          src={url!}
          alt={name ? `Foto de ${name}` : "Foto do contato"}
          className="object-cover"
          onError={() => setFailedUrl(url)}
        />
      )}
      <AvatarFallback className={cn("font-semibold", fallbackClassName)}>
        {initials || <User className={iconClassName} />}
      </AvatarFallback>
    </Avatar>
  );
}
