"""Backend-configurable defaults for the sequential simulation flow.

Changing the participant experience (which tasks, how many, in what
order, how long the whole simulation runs) means editing THIS file --
never the frontend. CockpitPage.tsx never chooses or reorders tasks; it
only ever renders whatever app/api/sessions.py's session-creation
handler stamped onto Session.task_sequence at the moment the session was
created (see app/models/session.py's task_sequence/task_sequence_position/
max_duration_seconds columns).

The four values here are plain TaskType.value strings, not TaskType
members, because they're stored as-is in a JSON column and compared
against TaskType(...) at read time (app/api/tasks.py) -- keeping this
list as strings avoids importing the enum here just to immediately
serialize it back.

email_prioritization is deliberately never part of this default
sequence (per the cahier's four required categories: data_validation,
document_organization, email_writing, urgent_request) -- it remains a
separate, additional task type with its own dedicated flow.
"""
DEFAULT_TASK_SEQUENCE = [
    "data_validation",
    "data_validation",
    "document_organization",
    "document_organization",
    "email_writing",
    "urgent_request",
]

# Whole-simulation ceiling, independent of any individual task's own
# deadline_seconds -- the two timers serve different purposes (session
# 6 tasks * ~2-4 minutes each of comfortable working time, plus headroom).
DEFAULT_MAX_DURATION_SECONDS = 1800  # 30 minutes
