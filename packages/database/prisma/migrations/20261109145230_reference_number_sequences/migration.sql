-- Gap-tolerant, concurrency-safe counters for human-readable references (Q-2026-000001, GS-2026-000001).
CREATE SEQUENCE IF NOT EXISTS "quotation_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1;
