# Sidebar triage counts

GET uses the same read-only ATTENTION_API_KEY bearer authentication as next-meeting. TODOIST_API_KEY stays on the server. Counts share Unplan's extraction, normal task triage, and priority review (purple Follow-up triage) predicates. No records are changed by this endpoint.

Sources include Todoist Inbox and managed unplan-calendar projects. For a custom preferred/bucket project selected in a browser, set ATTENTION_TODOIST_BUCKET_IDS to the same comma-separated project IDs; browser-only local tasks cannot be counted remotely until migrated to Todoist. Folder parents come from the synced task-refresh settings record. Provider errors return 503 rather than zero counts.
