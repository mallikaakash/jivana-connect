"""Repository layer.

The working set always lives in memory (dicts keyed by id) so the demo runs with zero infra.
When MONGO_URL is set, every write is also persisted to MongoDB (db `jivana`, one collection per
entity) and the store is loaded from Mongo on startup (seeded on first run and on reset).
Single-process by design: one uvicorn worker owns the data.
"""

from __future__ import annotations

import logging
from typing import Any

from .seed import COLLECTIONS

log = logging.getLogger("jivana.store")

ID_FIELDS = {
    "patients": "patient_id",
    "appointments": "appointment_id",
    "tasks": "task_id",
    "calls": "call_id",
    "escalations": "escalation_id",
    "events": "event_id",
    "batches": "batch_id",
    "batch_members": "member_id",
}


class Store:
    def __init__(self, mongo_url: str | None = None, mongo_db: str = "jivana"):
        self.data: dict[str, dict[str, dict]] = {name: {} for name in COLLECTIONS}
        self._seq = 0
        self._db = None
        self.mongo_status = "not_configured"
        self.mongo_detail = "In-memory store (data resets when the server restarts)"
        if mongo_url:
            self._connect(mongo_url, mongo_db)

    # ---- Mongo -----------------------------------------------------------------
    def _connect(self, url: str, db_name: str) -> None:
        try:
            from pymongo import MongoClient

            client = MongoClient(url, serverSelectionTimeoutMS=2000)
            client.admin.command("ping")
            self._db = client[db_name]
            self.mongo_status = "live"
            self.mongo_detail = f"Persisting to MongoDB database '{db_name}'"
        except Exception as exc:  # pragma: no cover - depends on infra
            log.warning("MONGO_URL is set but MongoDB is unreachable (%s); using in-memory store", type(exc).__name__)
            self._db = None
            self.mongo_status = "not_configured"
            self.mongo_detail = "MONGO_URL set but MongoDB unreachable — using in-memory store"

    @property
    def mongo_enabled(self) -> bool:
        return self._db is not None

    def load_from_mongo(self) -> bool:
        """Load the working set from Mongo. Returns False when Mongo is empty/disabled."""
        if self._db is None:
            return False
        try:
            if self._db["patients"].count_documents({}) == 0:
                return False
            for name in COLLECTIONS:
                self.data[name] = {}
                for doc in self._db[name].find({}):
                    doc.pop("_id", None)
                    self.data[name][doc[ID_FIELDS[name]]] = doc
            self._seq = max((e.get("_seq", 0) for e in self.data["events"].values()), default=0)
            return True
        except Exception as exc:  # pragma: no cover
            log.warning("Failed to load from MongoDB (%s); reseeding", type(exc).__name__)
            return False

    def _persist(self, collection: str, doc: dict) -> None:
        if self._db is None:
            return
        try:
            body = {k: v for k, v in doc.items() if k != "_id"}
            self._db[collection].replace_one({"_id": doc[ID_FIELDS[collection]]}, body, upsert=True)
        except Exception as exc:  # pragma: no cover
            log.warning("MongoDB write failed for %s (%s)", collection, type(exc).__name__)

    # ---- API -------------------------------------------------------------------
    def replace_all(self, seed: dict[str, list[dict]]) -> None:
        self._seq = 0
        for name in COLLECTIONS:
            self.data[name] = {}
            for doc in seed.get(name, []):
                if name == "events":
                    self._seq += 1
                    doc["_seq"] = self._seq
                self.data[name][doc[ID_FIELDS[name]]] = doc
        if self._db is not None:
            try:
                for name in COLLECTIONS:
                    self._db[name].delete_many({})
                    docs = [{"_id": d[ID_FIELDS[name]], **d} for d in self.data[name].values()]
                    if docs:
                        self._db[name].insert_many(docs)
            except Exception as exc:  # pragma: no cover
                log.warning("MongoDB reseed failed (%s)", type(exc).__name__)

    def get(self, collection: str, ident: str | None) -> dict | None:
        if not ident:
            return None
        return self.data[collection].get(ident)

    def all(self, collection: str) -> list[dict]:
        return list(self.data[collection].values())

    def save(self, collection: str, doc: dict) -> dict:
        if collection == "events" and "_seq" not in doc:
            self._seq += 1
            doc["_seq"] = self._seq
        self.data[collection][doc[ID_FIELDS[collection]]] = doc
        self._persist(collection, doc)
        return doc

    def save_many(self, *pairs: tuple[str, dict | None]) -> None:
        for collection, doc in pairs:
            if doc is not None:
                self.save(collection, doc)

    def find(self, collection: str, **criteria: Any) -> list[dict]:
        return [d for d in self.data[collection].values() if all(d.get(k) == v for k, v in criteria.items())]
