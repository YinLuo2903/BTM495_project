import { REPAIR_TYPES } from "../../services/appointments";

/** Must match the description limits in backend/apis/appointment_booking_api.py. */
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 500;

export interface IssueDetails {
  repairType: string;
  description: string;
}

export type IssueErrors = Partial<Record<keyof IssueDetails, string>>;

/** Step 1 is complete once a date and one time slot are chosen. */
export function canContinue(date: string | null, slot: string | null): boolean {
  return Boolean(date && slot);
}

/** Step 2 rules; an empty result means the details are valid. */
export function validateIssue({ repairType, description }: IssueDetails): IssueErrors {
  const errors: IssueErrors = {};
  if (!(REPAIR_TYPES as readonly string[]).includes(repairType)) errors.repairType = "Select a repair type.";
  const length = description.trim().length;
  if (length < DESCRIPTION_MIN) errors.description = `Describe the issue in at least ${DESCRIPTION_MIN} characters.`;
  else if (length > DESCRIPTION_MAX) errors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;
  return errors;
}
