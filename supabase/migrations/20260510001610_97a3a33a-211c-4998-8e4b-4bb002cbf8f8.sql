-- Drop mirror triggers on conversation_assignments
DROP TRIGGER IF EXISTS mirror_conversation_assignments_to_external ON public.conversation_assignments;
DROP TRIGGER IF EXISTS trg_mirror_conversation_assignments ON public.conversation_assignments;

-- Drop mirror triggers on conversation_stats
DROP TRIGGER IF EXISTS mirror_conversation_stats_to_external ON public.conversation_stats;
DROP TRIGGER IF EXISTS trg_mirror_conversation_stats ON public.conversation_stats;

-- Drop the mirror functions (use IF EXISTS in case names differ slightly)
DROP FUNCTION IF EXISTS public.mirror_conversation_assignments_to_external() CASCADE;
DROP FUNCTION IF EXISTS public.mirror_conversation_stats_to_external() CASCADE;
DROP FUNCTION IF EXISTS public.mirror_to_external() CASCADE;