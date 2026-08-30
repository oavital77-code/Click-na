import type { PROFESSION_TYPES, LOCATION_TYPES } from "@/lib/onboarding-schema";

export const PROFESSION_LABELS: Record<(typeof PROFESSION_TYPES)[number], string> = {
  coach: "קאוצ'ינג",
  massage: "טיפולי מגע",
  trainer: "אימון אישי / כושר",
  therapist: "טיפול / ייעוץ",
  tutor: "הוראה פרטית",
  other: "אחר",
};

export const LOCATION_LABELS: Record<(typeof LOCATION_TYPES)[number], string> = {
  clinic: "קליניקה",
  online: "אונליין",
  client_home: "בבית הלקוח",
  hybrid: "משולב",
};

export const DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
