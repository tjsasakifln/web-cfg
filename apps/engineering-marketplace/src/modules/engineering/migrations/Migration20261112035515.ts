import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112035515 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "engineering_request" ("id" text not null, "customer_id" text not null, "seller_id" text not null, "title" text not null, "description" text not null, "location" text not null, "intent_family" text not null, "status" text check ("status" in ('requested', 'quoted', 'accepted', 'paid', 'delivered', 'completed', 'cancelled', 'disputed', 'refunded')) not null default 'requested', "revision" integer not null default 0, "proposal" jsonb null, "acceptance" jsonb null, "payment" jsonb null, "delivery" jsonb null, "review" jsonb null, "events" jsonb not null default '{"entries":[]}', "terms_version" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "engineering_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_engineering_request_deleted_at" ON "engineering_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_engineering_request_customer_id_created_at" ON "engineering_request" ("customer_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_engineering_request_seller_id_created_at" ON "engineering_request" ("seller_id", "created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "engineering_request" cascade;`);
  }

}
