/**
 * TearBench-owned Training Archive compatibility facade.
 *
 * The headless intake stays outside the production agents barrel. Its
 * historical Academy format and implementation remain the storage boundary;
 * this module only gives TearBench callers a canonical name.
 */
export { ProductionHeadlessAcademyIntake as TrainingArchiveHeadlessIntake } from "./production-headless-academy-intake";
export type {
  ProductionHeadlessAcademyIntakeReceipt as TrainingArchiveHeadlessIntakeReceipt,
  ProductionHeadlessAcademyIntakeItem as TrainingArchiveHeadlessIntakeItem,
  ProductionHeadlessAcademyIntakeSnapshot as TrainingArchiveHeadlessIntakeSnapshot,
} from "./production-headless-academy-intake";
