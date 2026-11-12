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
const INSTITUTIONAL_NEEDS = [
  /\bprojetos\b/, /\borçamento\b/, /\binspeção\b/, /\bperícia\b/, /\bavaliação\b/,
  /\b(?:segurança do trabalho|sst)\b/, /\bobras públicas\b/,
];
const DELIVERY_CONTENT = [
  {
    id: "home-delivery-coordination", href: "/projetos/coordenacao-multidisciplinar/",
    criteria: [/\bdimensionamento\b/, /\binterfaces\b/, /\b(?:pranchas|memoriais)\b/, /\brevisões\b/],
  },
  {
    id: "home-delivery-budget", href: "/quantitativos-orcamento-obras/",
    criteria: [/\bquantidades\b/, /\bcritérios de medição\b/, /\bplanilhas\b/, /\b(?:custos|orçamento)\b/],
  },
  {
    id: "home-delivery-documents", href: "/entregas/",
    criteria: [/\b(?:relatórios|laudos|pareceres|dossiês)\b/, /\bverificações\b/, /\bfundamentação\b/, /\b(?:intervenções|avaliações|questões contratuais)\b/],
  },
];
const visibleMarkup = (html) => html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
const text = (html) => visibleMarkup(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
const openingTag = (element) => element.slice(0, element.indexOf(">") + 1);
const sectionByClass = (html, className) => html.match(new RegExp("<section\\b[^>]*class=\"[^\"]*\\b" + className + "\\b[^\"]*\"[^>]*>[\\s\\S]*?<\\/section>", "i"))?.[0] || "";
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "";
const exposed = (element) => Boolean(element)
  && !/(?:^|\s)hidden(?=\s|=|\/?>)/i.test(openingTag(element))
  && attribute(openingTag(element), "aria-hidden").toLowerCase() !== "true";
const attributedPath = (anchors, id, href, position) => {
  const found = anchors.map(openingTag).filter((tag) => attribute(tag, "data-cta-id") === id);
  return found.length === 1 && exposed(found[0]) && attribute(found[0], "href") === href
    && attribute(found[0], "data-event-name") === "cta_click"
    && attribute(found[0], "data-cta-position") === position;
};

export function evaluateHomeAcquisition(html) {
  html = visibleMarkup(html);
  const opening = html.match(/<section\b[^>]*class="[^"]*\bhome-opening\b[^"]*"[^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  const heading = text(opening.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0] || "");
  const lead = text(opening.match(/<p\b[^>]*class="[^"]*\bhero-lead\b[^"]*"[^>]*>[\s\S]*?<\/p>/i)?.[0] || "");
  const openingText = text(opening);
  const scope = opening.match(/<ul\b[^>]*class="[^"]*\bhome-opening__scope\b[^"]*"[^>]*>[\s\S]*?<\/ul>/i)?.[0] || "";
  const scopeText = [...scope.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)]
    .map((match) => match[0]).filter(exposed).map(text).join(" ");
  const process = text(sectionByClass(html, "home-conduction"));
  const deliverySection = sectionByClass(html, "home-evidence");
  const deliveryCards = [...deliverySection.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]);
  const discoveryPaths = DISCOVERY.every(([id, href, position]) => attributedPath(anchors, id, href, position));
  // These are contracted service contents, not claims of completed client work.
  // Each distinct card must explain criteria, artifacts and their intended use,
  // and retain its own attributed destination on the public site.
  const matchedDeliveryCards = new Set();
  const deliveryProof = exposed(deliverySection) && deliveryCards.length === DELIVERY_CONTENT.length
    && !/caso real|case de sucesso|portf[óo]lio/i.test(text(deliverySection))
    && DELIVERY_CONTENT.every(({ id, href, criteria }) => {
      if (!attributedPath(anchors, id, href, "deliverables")) return false;
      const cards = deliveryCards.filter((card) => attributedPath(
        [...card.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]), id, href, "deliverables",
      ));
      if (cards.length !== 1 || !exposed(cards[0]) || matchedDeliveryCards.has(cards[0])) return false;
      matchedDeliveryCards.add(cards[0]);
      const cardText = [...cards[0].matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)]
        .map((match) => match[0]).filter(exposed).map(text).join(" ");
      const heading = cards[0].match(/<h3\b[^>]*>[\s\S]*?<\/h3>/i)?.[0] || "";
      return exposed(heading) && Boolean(text(heading)) && criteria.every((pattern) => pattern.test(cardText));
    });
  const primary = anchors.filter((anchor) => attribute(openingTag(anchor), "class").split(/\s+/).includes("button-primary") && attribute(openingTag(anchor), "data-cta-position") === "hero");
  const contact = html.match(/<section\b[^>]*id="contato"[^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  const forms = [...contact.matchAll(/<form\b[^>]*>/gi)].map((match) => match[0])
    .filter((tag) => /(?:^|\s)data-capture-form(?=\s|=|\/?>)/i.test(tag));
  const form = forms.length === 1 ? forms[0] : "";
  const primaryTag = primary[0] ? openingTag(primary[0]) : "";
  return {
    headingScope: ["projetos", "serviços", "engenharia"].every((term) => heading.includes(term))
      && openingText.includes("necessidades públicas e privadas"),
    executionScope: lead.includes("elabora e coordena projetos")
      && ["projetos", "planilhas", "laudos"].every((term) => lead.includes(term))
      && /\b(?:construir|contratar|contratação|decidir|decisão|execução)\b/.test(lead),
    amplitudeScope: exposed(scope) && INSTITUTIONAL_NEEDS.every((pattern) => pattern.test(scopeText)),
    processScope: ["entender a necessidade", "definir o trabalho", "conduzir e integrar", "entregar para a decisão"]
      .every((term) => process.includes(term)),
    deliveryProof,
    discoveryPaths,
    proposalPath: primary.length === 1 && text(primary[0]).includes("solicitar proposta")
      && attribute(primaryTag, "href") === "#contato" && attribute(primaryTag, "data-event-name") === "cta_click"
      && !/@|\+?\d{10,}/.test(primaryTag) && attribute(form, "method").toUpperCase() === "POST"
      && ["diagnostico-b2g", "diagnostico-confenge"].includes(attribute(form, "name")) && attribute(form, "data-ajax") === "true"
      && attribute(form, "data-runtime-profile") === "shared_lead_form_v1" && attribute(form, "data-receipt-required") === "true",
  };
}
