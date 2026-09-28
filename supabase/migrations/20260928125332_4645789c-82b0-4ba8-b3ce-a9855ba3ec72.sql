UPDATE public.conversation_assignments SET sector_id='64f60ee5-4950-4e2e-81cc-36b4bdf8f15b', updated_at=now()
WHERE organization_id='e00395ba-8423-4b03-b87f-47bceb140cd8' AND sector_id IS NULL AND status='in_progress'
  AND public.get_campaign_sector_for_phone(organization_id, conversation_phone) IS NOT NULL;