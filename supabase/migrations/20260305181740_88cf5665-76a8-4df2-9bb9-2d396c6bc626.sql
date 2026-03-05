UPDATE organizations 
SET subscription_paid_until = '2026-04-03 03:00:00+00', 
    subscription_status = 'active',
    updated_at = now()
WHERE id = '76b7f9cc-21e9-479e-a770-61eca506edcb'