export type SemanticViewType =
  | "collection"
  | "detail"
  | "form"
  | "selector"
  | "confirmation"
  | "approval"
  | "payment-intent"
  | "progress"
  | "tracking"
  | "error-recovery"
  | "human-handoff";

export type SemanticActionType =
  | "follow-up"
  | "capability"
  | "navigate"
  | "dismiss"
  | "human-handoff";

export interface SemanticExperienceField {
  path: string;
  role:
    | "title"
    | "subtitle"
    | "body"
    | "media"
    | "money"
    | "status"
    | "metadata"
    | "identifier";
  label?: string;
  priority?: number;
}

export interface SemanticInteractionIntent {
  confirmation?: "none" | "required";
}

export interface SemanticExperienceAction {
  id: string;
  type: SemanticActionType;
  capability?: string;
  interaction?: SemanticInteractionIntent;
  target?: string;
}

export interface SemanticExperience {
  apiVersion: "brivya.dev/v0alpha1";
  kind: "SemanticExperience";
  metadata: {
    id: string;
    version?: string;
  };
  view: {
    type: SemanticViewType;
    resource?: string;
  };
  fields?: readonly SemanticExperienceField[];
  actions?: readonly SemanticExperienceAction[];
  navigation?: Readonly<Record<string, { type: SemanticViewType; target?: string }>>;
  hints?: {
    density?: "compact" | "comfortable";
    grouping?: "flat" | "sectioned";
    emphasis?: "content" | "action" | "balanced";
  };
}

export interface SemanticRenderBinding {
  semanticAction: string;
  capability?: string;
  platformAction: string;
}

export interface SemanticRenderResult {
  experience: string;
  renderer: string;
  profileVersion: string;
  bindings: readonly SemanticRenderBinding[];
  artifacts: readonly string[];
}
