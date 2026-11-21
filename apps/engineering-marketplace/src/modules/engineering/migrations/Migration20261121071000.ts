import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261121071000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE engineering_reputation_evidence (
      id text PRIMARY KEY,
      seller_id text NOT NULL,
      kind text NOT NULL,
      issuer text NOT NULL,
      official_id text NOT NULL,
      issued_on date NOT NULL,
      status text NOT NULL CHECK (status IN ('submitted','in_review','verified','rejected','correction_required','revoked','expired')),
      verification jsonb,
      sha256 text,
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (seller_id, kind, issuer, official_id)
    );`)
    this.addSql(`CREATE UNIQUE INDEX engineering_reputation_evidence_hash
      ON engineering_reputation_evidence(seller_id, sha256) WHERE sha256 IS NOT NULL;`)
    this.addSql(`CREATE TABLE engineering_reputation_event (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      seller_id text NOT NULL,
      evidence_id text NOT NULL REFERENCES engineering_reputation_evidence(id),
      action text NOT NULL,
      previous_status text,
      next_status text NOT NULL,
      decision jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );`)
    this.addSql(`CREATE INDEX engineering_reputation_event_owner ON engineering_reputation_event(seller_id, id DESC);`)
    this.addSql(`CREATE TABLE engineering_reputation_policy (
      version text PRIMARY KEY,
      digest text NOT NULL,
      policy jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );`)
    this.addSql(`CREATE TABLE engineering_reputation_projection (
      seller_id text NOT NULL,
      specialty text NOT NULL,
      payload jsonb NOT NULL,
      digest text NOT NULL,
      eligible boolean NOT NULL DEFAULT false,
      qualification numeric(5, 2),
      total numeric(5, 2),
      computed_at timestamptz NOT NULL,
      valid_until timestamptz,
      PRIMARY KEY (seller_id, specialty)
    );`)
    this.addSql(`CREATE INDEX engineering_reputation_projection_expiry
      ON engineering_reputation_projection(valid_until) WHERE specialty = '';`)
    this.addSql(`CREATE INDEX engineering_reputation_rank
      ON engineering_reputation_projection(specialty, qualification DESC NULLS LAST, total DESC NULLS LAST, seller_id)
      WHERE eligible;`)
    this.addSql(`CREATE TABLE engineering_reputation_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, seller_id text NOT NULL,
      payload jsonb NOT NULL, computed_at timestamptz NOT NULL
    );`)
    this.addSql(`CREATE INDEX engineering_reputation_history_owner ON engineering_reputation_history(seller_id, id DESC);`)
    this.addSql(`CREATE TABLE engineering_reputation_queue (
      seller_id text PRIMARY KEY, queued_at timestamptz NOT NULL DEFAULT now()
    );`)
    this.addSql(`CREATE FUNCTION engineering_queue_reputation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.status IN ('completed','disputed','refunded') OR OLD.status = 'completed')
            AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.review IS DISTINCT FROM OLD.review
                 OR NEW.payment IS DISTINCT FROM OLD.payment OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
          INSERT INTO engineering_reputation_queue (seller_id) VALUES (NEW.seller_id)
            ON CONFLICT (seller_id) DO UPDATE SET queued_at = EXCLUDED.queued_at;
        END IF;
        RETURN NEW;
      END; $$;`)
    this.addSql(`CREATE TRIGGER engineering_request_reputation AFTER UPDATE ON engineering_request
      FOR EACH ROW EXECUTE FUNCTION engineering_queue_reputation();`)
  }

  override async down(): Promise<void> {
    throw new Error("Pause the reputation feature and preserve evidence and review history before any schema rollback.")
  }
}
