import { Module } from "@medusajs/framework/utils"
import EngineeringService from "./service"
export const ENGINEERING_MODULE = "engineering"
export default Module(ENGINEERING_MODULE, { service: EngineeringService })
