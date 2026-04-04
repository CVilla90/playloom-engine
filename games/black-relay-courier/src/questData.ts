import { CERTIFICATION_BANDS } from "./flightModel";

export interface QuestStepDefinition {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly detail: string;
  readonly accent: string;
}

export interface QuestDefinition {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly issuer: string;
  readonly issuerShort: string;
  readonly summary: string;
  readonly reward: string;
  readonly steps: readonly QuestStepDefinition[];
}

export interface RadioTransmission {
  readonly sender: string;
  readonly channel: string;
  readonly subject: string;
  readonly body: string;
  readonly accent: string;
}

export const FIRST_QUEST: QuestDefinition = {
  id: "explorer-charter",
  code: "EXPLR-01",
  title: "Explorer Charter",
  issuer: "Outer Relay Registry",
  issuerShort: "Registry",
  summary: "Sync the four wake windows and prove you can keep a live carrier readable.",
  reward: "Provisional exploration lane",
  steps: [
    {
      id: CERTIFICATION_BANDS[0]!.id,
      label: CERTIFICATION_BANDS[0]!.label,
      shortLabel: "IGNITION",
      detail: CERTIFICATION_BANDS[0]!.brief,
      accent: CERTIFICATION_BANDS[0]!.accent
    },
    {
      id: CERTIFICATION_BANDS[1]!.id,
      label: CERTIFICATION_BANDS[1]!.label,
      shortLabel: "BURN",
      detail: CERTIFICATION_BANDS[1]!.brief,
      accent: CERTIFICATION_BANDS[1]!.accent
    },
    {
      id: CERTIFICATION_BANDS[2]!.id,
      label: CERTIFICATION_BANDS[2]!.label,
      shortLabel: "DROP",
      detail: CERTIFICATION_BANDS[2]!.brief,
      accent: CERTIFICATION_BANDS[2]!.accent
    },
    {
      id: CERTIFICATION_BANDS[3]!.id,
      label: CERTIFICATION_BANDS[3]!.label,
      shortLabel: "PEAK",
      detail: CERTIFICATION_BANDS[3]!.brief,
      accent: CERTIFICATION_BANDS[3]!.accent
    }
  ]
};

export const FIRST_QUEST_INTRO: RadioTransmission = {
  sender: "Registrar Ione Vale",
  channel: "Outer Relay Registry",
  subject: "Explorer Charter",
  body: "Courier prospect, sync the four wake windows on your dash. Hold them cleanly and I will file your provisional explorer charter.",
  accent: "#97e8ff"
};

export const FIRST_QUEST_COMPLETE: RadioTransmission = {
  sender: "Registrar Ione Vale",
  channel: "Outer Relay Registry",
  subject: "Charter Filed",
  body: "Clean run. Your provisional explorer lane is open. Drift the carrier or reset the trial if you want another pass.",
  accent: "#aaf8c3"
};
