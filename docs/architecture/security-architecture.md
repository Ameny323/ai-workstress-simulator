# Security Architecture

This document lists only controls that were directly verified in the source code.

## Authentication

- Passwords are hashed with `bcrypt` (`app/core/security.py:hash_password`/`verify_password`).
- Tokens are JSON Web Tokens, algorithm **HS256** (`app/core/security.py`), issued at `POST /auth/login`, containing `{"sub": <user_id>, "exp": <expiry>}`.
- Token lifetime: `ACCESS_TOKEN_EXPIRE_MINUTES`, default **60 minutes**, configurable via environment variable.
- Every protected REST route depends on `get_current_user` (`app/api/deps.py`), which decodes the bearer token and loads the corresponding `User` row; a missing/invalid token or a token for a non-existent user yields 401.

## Authorization / ownership

- `get_owned_session(session_id, db, current_user)` (duplicated identically in `sessions.py` and `tasks.py`): 404 if the session does not exist, 403 if `session.user_id != current_user.id`.
- `get_owned_task(task_id, db, current_user)`: 404 if the task does not exist, otherwise delegates to `get_owned_session` on the task's `session_id`.
- Every session/task/report/stress/engage endpoint routes through one of these two functions before touching any data.

## Session isolation

Verified by direct testing during this project's stabilization phase: a second, unrelated user receives 403 when attempting to fetch another user's session's report, task, or next-task, and when attempting to call `/engage` on another user's task.

## WebSocket authentication

Covered in full in `websocket-architecture.md`: JWT via query parameter, ownership check before `accept()`, close codes 4401/4403 for invalid token / wrong owner respectively.

## OpenAI API key handling

`OPENAI_API_KEY` is read exactly once, in `app/core/config.py`, from the environment. It is passed only to the `AsyncOpenAI` client constructor in `app/ai/openai_service.py`. It never appears in any Pydantic response schema, any WebSocket broadcast payload, or any frontend source file — verified by inspecting every schema in `app/schemas/` and every broadcast call site.

## Frontend secret exposure

No secret material is present in the frontend bundle beyond the user's own short-lived JWT, held in browser storage via `frontend/src/api/client.ts` and attached as a bearer token on each request. The frontend has no reference to `OPENAI_API_KEY` or `JWT_SECRET` anywhere in its source.

## Cross-user access — verified controls

| Resource | Protection | Verified result for a non-owning user |
|---|---|---|
| Session report | `get_owned_session` | 403 |
| Task (fetch/complete/engage) | `get_owned_task` | 403 |
| Next-task | `get_owned_session` | 403 |
| Stress declaration | `get_owned_session` | 403 (via the same dependency chain) |
| WebSocket connection | Manual ownership check pre-`accept()` | Connection closed with 4403 |

## Deployment/configuration risk — `JWT_SECRET`

`app/core/config.py`:
```python
SECRET_KEY = os.getenv("JWT_SECRET", "change_this_secret_in_production")
```
**This is an insecure development fallback.** If the `JWT_SECRET` environment variable is not set in a deployed environment, the application will silently sign and verify tokens with a publicly-known literal string, which would allow anyone to forge valid authentication tokens.

**This is a deployment/configuration risk, not a code defect** — the mechanism (HS256 signing with an environment-supplied secret) is correct; the risk exists only if the operator fails to set the environment variable in production. This document does not modify the value; it must be replaced with a securely generated secret before any non-development deployment.

## WebSocket single-process limitation

Documented fully in `websocket-architecture.md`. Noted here because it is also a scaling/availability consideration: the in-memory connection registry does not survive a process restart and does not fan out across multiple worker processes.
