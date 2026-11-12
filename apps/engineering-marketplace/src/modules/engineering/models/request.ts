import { model } from "@medusajs/framework/utils"

export const EngineeringRequest = model.define("engineering_request", {
  id: model.id({ prefix: "engr" }).primaryKey(),
  customer_id: model.text(),
  seller_id: model.text(),
  title: model.text(),
  description: model.text(),
  location: model.text(),
  intent_family: model.text(),
  status: model.enum(["requested", "quoted", "accepted", "paid", "delivered", "completed", "cancelled", "disputed", "refunded"]).default("requested"),
  revision: model.number().default(0),
  proposal: model.json().nullable(),
  acceptance: model.json().nullable(),
  payment: model.json().nullable(),
  delivery: model.json().nullable(),
  review: model.json().nullable(),
  events: model.json().default({ entries: [] }),
  terms_version: model.text(),
}).indexes([
  { on: ["customer_id", "created_at"] },
  { on: ["seller_id", "created_at"] },
])
