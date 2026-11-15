-- Run only via your trusted database administrator/maintenance process.
-- Choose retention periods appropriate to your actual operational requirements.
-- No scheduler is installed by this project.
delete from private.rate_limits where bucket < now() - interval '2 days';
delete from private.push_receipts where checked_at < now() - interval '30 days';
delete from private.push_outbox where delivered_at < now() - interval '60 days';
-- Never automatically delete open reports or administrator audit logs here.
