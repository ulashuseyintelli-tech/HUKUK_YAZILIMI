"""Demo FactStore adapter.

Replace this with your real FactStore implementation backed by DB/Redis/etc.
"""
from engine_v28.engine_runner.factstore import InMemoryFactStore

FACTSTORE = InMemoryFactStore()
