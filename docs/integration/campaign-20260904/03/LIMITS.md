# Offer limits and wave classes

Modeled SKUs: 17. Retained B2G: 54 deliverables + 4 checkout offers. Total assembled: 75.

| offer_id | nucleus | wave_class | readiness | ART | field default | ticket_class |
|---|---|---|---|---|---|---|
| pre_litigation_technical_screening | expert_evidence_assistance | MODEL_ONLY | MODELED | not for screening | no | remote_documental |
| civil_building_technical_assistance | expert_evidence_assistance | MODEL_ONLY | MODELED | when technical opinion | no | field_inspection |
| labor_sst_technical_assistance | expert_evidence_assistance | MODEL_ONLY | MODELED | SST engineering only | no | field_inspection |
| urban_property_valuation | property_valuation | WITHHELD_PROOF | WITHHELD | when valuation of attribution | no | field_inspection |
| preliminary_property_opinion | property_valuation | MODEL_ONLY | MODELED | only if technical opinion | no | remote_documental |
| quantity_takeoff_budgeting | building_engineering_documentation | MODEL_ONLY | MODELED | when engineering budget | no | remote_documental |
| budget_audit_feasibility | building_engineering_documentation | MODEL_ONLY | MODELED | when technical report | no | remote_documental |
| bim_coordination_clash_register | building_engineering_documentation | WITHHELD_PROOF | WITHHELD | when technical coordination | no | remote_documental |
| building_inspection_pathology | building_engineering_documentation | WITHHELD_CAPACITY | CAPACITY_UNKNOWN | inspection report | yes, one visit | field_inspection |
| renovation_plan_condo_review | building_engineering_documentation | WITHHELD_CAPACITY | CAPACITY_UNKNOWN | plan/parecer | no | field_inspection |
| asbuilt_document_reconciliation | building_engineering_documentation | MODEL_ONLY | MODELED | when as-built document | no | field_inspection |
| private_project_technical_readiness_assessment | building_engineering_documentation | FIRST_WAVE_CANARY | MODELED | when technical report | no | remote_documental |
| sst_risk_documentation_diagnosis | occupational_safety | MODEL_ONLY | MODELED | SST diagnosis | no | remote_documental |
| sst_pgr_ltcat_aet_inputs | occupational_safety | WITHHELD_CAPACITY | CAPACITY_UNKNOWN | per engineering module | modules only | field_inspection |
| sst_insalubrity_perilousness_analysis | occupational_safety | WITHHELD_CAPACITY | CAPACITY_UNKNOWN | engineering analysis | no | field_inspection |
| sst_preventive_audit | occupational_safety | MODEL_ONLY | MODELED | audit report | yes, walkthrough | field_inspection |
| public_works_technical_procurement_planning | public_works_b2g | MODEL_ONLY | WITHHELD | per module | modules only | remote_documental |
| CFG-D01..CFG-D54 | public_works_b2g | RETAIN_B2G | from public_state | retained rule | retained | retained_published |
| CFG-DIAG-EXP-v1 / CFG-DIRB2G-* | public_works_b2g | RETAIN_B2G | PUBLISHABLE | retained rule | no | retained_published |

Only `private_project_technical_readiness_assessment` is FIRST_WAVE_CANARY. Modeling is not publishing. `#588` is unpublished. SLA for new offers is UNKNOWN. No public price on modeled offers.

## Gaps (not SKUs)

Rural valuation, court-appointed expert, legal representation, occupational physician as internal, architecture design, criminal forensics, environmental licensing, #588 publication, NR-12 machines, SaaS, hourly staff, open retainer, international valuation, mining, naval, electrical design as primary, fire brigade training, ISO certification body, airport pavement specialty.
