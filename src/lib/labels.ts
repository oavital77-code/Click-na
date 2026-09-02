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
export const DAY_LABELS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export const MONTH_LABELS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
