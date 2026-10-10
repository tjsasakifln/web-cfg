/** Material acquisition contract for the institutional home, independent of layout copy. */
const DISCOVERY = [
  ["home-service-projects", "/projetos/", "home_services"],
  ["home-private-quantities-budget", "/quantitativos-orcamento-obras/", "home_services"],
  ["home-service-inspection", "/inspecao-diagnostico-edificacoes/", "home_services"],
  ["home-service-expert-evidence", "/assistencia-tecnica-pericial-engenharia/", "home_services"],
  ["home-service-valuation", "/servicos/#servico-avaliacao", "home_services"],
  ["home-service-sst", "/seguranca-trabalho-apoio-tecnico/", "home_services"],
  ["home-service-public-works", "/servicos-obras-publicas/", "home_services"],
];
const INSTITUTIONAL_FRONTS = ["projetos", "orçamento", "inspeção", "perícia", "avaliação", "sst", "obras públicas"];
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
const openingTag = (element) => element.slice(0, element.indexOf(">") + 1);
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "";

export function evaluateHomeAcquisition(html) {
  const opening = html.match(/<section\b[^>]*class="[^"]*\bhome-opening\b[^"]*"[^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  const heading = text(opening.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0] || "");
  const lead = text(opening.match(/<p\b[^>]*class="[^"]*\bhero-lead\b[^"]*"[^>]*>[\s\S]*?<\/p>/i)?.[0] || "");
  const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]);
  const discoveryPaths = DISCOVERY.every(([id, href, position]) => {
    const found = anchors.map(openingTag).filter((tag) => attribute(tag, "data-cta-id") === id);
    return found.length === 1 && attribute(found[0], "href") === href
      && attribute(found[0], "data-event-name") === "cta_click"
      && attribute(found[0], "data-cta-position") === position;
  });
  const primary = anchors.filter((anchor) => attribute(openingTag(anchor), "class").split(/\s+/).includes("button-primary") && attribute(openingTag(anchor), "data-cta-position") === "hero");
  const contact = html.match(/<section\b[^>]*id="contato"[^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  const forms = [...contact.matchAll(/<form\b[^>]*>/gi)].map((match) => match[0])
    .filter((tag) => /(?:^|\s)data-capture-form(?=\s|=|\/?>)/i.test(tag));
  const form = forms.length === 1 ? forms[0] : "";
  const primaryTag = primary[0] ? openingTag(primary[0]) : "";
  return {
    headingScope: heading.includes("decisões técnicas")
      && /engenharia, perícias e inteligência técnica/.test(text(opening)),
    executionScope: /\b(?:elabora|projetamos|desenvolvemos)\b/.test(lead)
      && /\bcoorden/.test(lead) && ["estruturas", "instalações", "infraestrutura"].every((term) => lead.includes(term)),
    amplitudeScope: INSTITUTIONAL_FRONTS.every((term) => lead.includes(term)),
    discoveryPaths,
    proposalPath: primary.length === 1 && text(primary[0]).includes("solicitar proposta")
      && attribute(primaryTag, "href") === "#contato" && attribute(primaryTag, "data-event-name") === "cta_click"
      && !/@|\+?\d{10,}/.test(primaryTag) && attribute(form, "method").toUpperCase() === "POST"
      && ["diagnostico-b2g", "diagnostico-confenge"].includes(attribute(form, "name")) && attribute(form, "data-ajax") === "true"
      && attribute(form, "data-runtime-profile") === "shared_lead_form_v1" && attribute(form, "data-receipt-required") === "true",
  };
}
