import type { AgentConfig } from "../blackboard/types.js";
import type { DetectedLanguage } from "./language-detect.js";

const ZH_ROLE_NAME_MAP: Record<string, string> = {
  skeptic: "质疑者",
  proponent: "倡导者",
  analyst: "分析师",
  pragmatist: "务实派",
  "security-auditor": "安全审计员",
  "performance-engineer": "性能工程师",
  "maintainability-advocate": "可维护性倡导者",
  "devils-advocate": "反方辩手",
  ethicist: "伦理审查员",
  "product-manager": "产品经理",
};

const ZH_PERSONA_MAP: Record<string, string> = {
  skeptic: "你是严格的质疑者。请以证据为先，持续挑战未经验证的假设，指出逻辑漏洞与前提缺失。",
  proponent: "你是建设性的倡导者。请为可行方案建立最强论证，强调价值与机会，同时正面回应反对意见。",
  analyst: "你是数据驱动的分析师。请优先使用事实、指标与案例进行比较，避免主观臆测。",
  pragmatist: "你是务实工程师。请重点评估实现成本、复杂度、交付节奏与运行风险。",
  "security-auditor": "你是安全审计员。请从威胁建模、攻击面、鉴权与数据暴露风险角度审查方案。",
  "performance-engineer": "你是性能工程师。请关注时延、吞吐、内存、扩展性和性能瓶颈。",
  "maintainability-advocate": "你是可维护性倡导者。请评估可读性、可测试性、边界清晰度与长期演进成本。",
  "devils-advocate": "你是反方辩手。请主动提出最强反例、边界条件和失败场景，帮助团队识别盲点。",
  ethicist: "你是伦理审查员。请评估公平性、偏见、隐私影响、潜在滥用和社会后果。",
  "product-manager": "你是产品经理。请从用户价值、业务收益、优先级与上线节奏角度判断方案。",
};

export function getRoleDisplayName(role: string, language?: string): string {
  if (language !== "zh") return role;
  return ZH_ROLE_NAME_MAP[role] ?? role;
}

export function getLocalizedPersona(role: string, language: DetectedLanguage, fallbackPersona?: string): string {
  if (language !== "zh") {
    return fallbackPersona ?? `You are debating as the "${role}" perspective.`;
  }

  return (
    ZH_PERSONA_MAP[role] ??
    fallbackPersona ??
    `你从“${getRoleDisplayName(role, "zh")}”视角参与辩论。请提供结构化、可验证、可落地的论证。`
  );
}

export function localizeAgentsForLanguage(agents: AgentConfig[], language: DetectedLanguage): AgentConfig[] {
  if (language !== "zh") return agents;

  return agents.map((agent) => ({
    ...agent,
    persona: getLocalizedPersona(agent.role, language, agent.persona),
  }));
}
