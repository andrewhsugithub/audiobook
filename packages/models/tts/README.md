## Setup

```bash
uv sync

uv run uvicorn server:app --port 7777
uv run uvicorn server:app --port 7777 --reload # for development
# check localhost:7777/docs for API docs
```
