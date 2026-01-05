from __future__ import annotations
from typing import Callable, Dict

from engine_v28.models import OutboxAction
from .handlers import handle_open_lock, handle_enqueue, handle_send_email

HANDLERS: Dict[str, Callable[[dict], None]] = {
    "open_lock": handle_open_lock,
    "enqueue": handle_enqueue,
    "send_email": handle_send_email,
}

def dispatch(action: OutboxAction) -> None:
    if action.action_type not in HANDLERS:
        raise KeyError(f"No handler for action_type: {action.action_type}")
    payload = action.payload or {}
    HANDLERS[action.action_type](payload)
