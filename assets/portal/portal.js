(() => {
  "use strict";
  const root = document.querySelector("#portal-main");
  const isAdminPath = location.pathname.startsWith("/intranet");
  const requestedRole = isAdminPath ? "admin" : "client";
  const title = isAdminPath ? "Intranet" : "Área do cliente";
  const labels = { proposta: "Proposta", documentos: "Documentos", habilitacao: "Habilitação", orcamento: "Orçamento", contrato: "Contrato", outro: "Outros serviços" };
  const statuses = { aberto: "Aberto", em_analise: "Em análise", aguardando_cliente: "Aguardando cliente", concluido: "Concluído" };
  let session = null;
  let dashboard = null;

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value == null) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    });
    (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(child => node.append(child));
    return node;
  };
  const fmtDate = value => {
    if (!value) return "Sem atualização";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
  };
  const errorMessage = error => ({
    unauthorized: "Credenciais inválidas ou acesso não autorizado.",
    forbidden: "Você não tem permissão para esta operação.",
    invalid_credentials: "Usuário ou senha inválidos.",
    password_change_required: "Defina uma nova senha para continuar.",
    invalid_file_type: "Envie um arquivo PDF, ZIP, DOCX, XLSX ou CSV.",
    file_too_large: "O arquivo excede o tamanho permitido.",
    invalid_control: "O arquivo do Controle Global não está no formato esperado.",
    not_found: "O item solicitado não foi encontrado.",
  }[error?.body?.error] || error?.message || "Não foi possível concluir a operação.");
  const fmtMoney = value => typeof value === "number" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value) : (value || "—");
  const api = async (path, options = {}) => {
    const response = await fetch(`/api/portal${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || "Não foi possível concluir a operação."); error.status = response.status; error.body = body; throw error; }
    return body;
  };
  const button = (text, kind = "button--primary", handler, type = "button") => el("button", { class: `button ${kind}`, type, text, onclick: handler });
  const flash = (message, host) => { const note = el("p", { class: "flash", text: message }); host.prepend(note); return note; };

  function login() {
    root.replaceChildren();
    const form = el("form");
    const username = el("input", { name: "username", required: "", autocomplete: "username", placeholder: isAdminPath ? "admincfg" : "EXTRA" });
    const password = el("input", { name: "password", type: "password", required: "", autocomplete: "current-password" });
    const activation = el("input", { name: "activationCode", autocomplete: "one-time-code", placeholder: "Código de ativação" });
    const activationField = el("label", { class: isAdminPath ? "" : "hide", text: "Ativação inicial" }, activation);
    const submit = el("button", { class: "button button--primary", type: "submit", text: "Entrar" });
    form.append(
      el("label", { text: "Usuário" }, username),
      el("label", { text: "Senha" }, password), activationField, submit,
      el("p", { class: "form-note", text: isAdminPath ? "No primeiro acesso, informe o código de ativação definido pela administração." : "Use suas credenciais de acesso à área reservada." })
    );
    form.addEventListener("submit", async event => {
      event.preventDefault();
      form.querySelectorAll(".flash").forEach(n => n.remove());
      submit.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        const answer = await api("/login", { method: "POST", body: JSON.stringify({ role: requestedRole, ...values }) });
        session = answer; await load();
      } catch (error) {
        if (error.status === 409 && error.body.error === "password_change_required") return passwordChange(form, username.value, password.value, activation.value);
        flash(errorMessage(error), form);
      } finally { submit.disabled = false; }
    });
    const card = el("section", { class: "login-card" }, [el("span", { class: "eyebrow", text: "CONFENGE · acesso reservado" }), el("h2", { text: title }), el("p", { text: isAdminPath ? "Acompanhe atendimentos, disponibilize documentos e mantenha a operação organizada." : "Acompanhe oportunidades, documentos e solicitações junto à CONFENGE." }), form]);
    root.append(el("div", { class: "login" }, [el("aside", { class: "login__brand" }, [el("img", { class: "brand-logo", src: "/assets/logo-confenge.png", alt: "CONFENGE" }), el("div", {}, [el("h1", { text: isAdminPath ? "Gestão do atendimento em um só lugar." : "Informações da Extra, organizadas para decidir." }), el("p", { text: "Projetos, perícias e inteligência técnica para empreendimentos públicos e privados." })])]), el("div", { class: "login__content" }, card)]));
  }

  function passwordChange(host, user, currentPassword, activationCode) {
    const next = el("input", { type: "password", required: "", minlength: "14", autocomplete: "new-password" });
    const confirmation = el("input", { type: "password", required: "", minlength: "14", autocomplete: "new-password" });
    const form = el("form", {}, [el("h3", { text: "Defina uma nova senha" }), el("p", { class: "form-note", text: "A senha temporária precisa ser substituída antes de continuar." }), el("label", { text: "Nova senha" }, next), el("label", { text: "Confirme a nova senha" }, confirmation)]);
    const submit = button("Atualizar senha", "button--primary", undefined, "submit"); form.append(submit);
    form.addEventListener("submit", async event => { event.preventDefault(); if (next.value !== confirmation.value) return flash("As senhas não coincidem.", form); try { session = await api("/login", { method: "POST", body: JSON.stringify({ role: requestedRole, username: user, password: currentPassword, activationCode, newPassword: next.value }) }); await load(); } catch (error) { flash(errorMessage(error), form); } });
    host.replaceWith(form);
  }

  function shell() {
    const navItems = [["overview", "Visão geral"], ["control", "Controle Global"], ["tickets", "Solicitações"], ["documents", "Documentos"]];
    const nav = el("nav", { class: "nav", "aria-label": "Navegação da área reservada" });
    navItems.forEach(([id, label]) => nav.append(button(label, "", () => showView(id))));
    const sidebar = el("aside", { class: "sidebar" });
    const menu = button("Menu", "button--line mobile-menu", () => sidebar.classList.toggle("is-open"));
    const signOut = button("Sair", "button--line", async () => { await api("/logout", { method: "POST" }).catch(() => null); session = null; dashboard = null; login(); });
    sidebar.append(el("div", { class: "sidebar__top" }, [el("img", { class: "brand-logo", src: "/assets/logo-confenge.png", alt: "CONFENGE" }), menu]), el("div", { class: "identity" }, [el("strong", { text: session.username }), el("span", { text: session.role === "admin" ? "Administração CONFENGE" : "Extra Construtora" })]), nav, el("div", { class: "sidebar__bottom" }, signOut));
    const content = el("section", { class: "content" });
    root.replaceChildren(el("div", { class: "app" }, [sidebar, content]));
    return { content, nav, sidebar };
  }

  function ticketItem(ticket, click) {
    const unread = ticket.unread ? el("span", { class: "dot", title: "Nova mensagem" }) : null;
    return el("button", { class: "ticket", type: "button", onclick: click }, [unread, el("div", { class: "ticket__main" }, [el("strong", { text: ticket.subject || labels[ticket.category] || "Solicitação" }), el("span", { text: `${labels[ticket.category] || ticket.category} · ${fmtDate(ticket.updatedAt)}` })]), el("span", { class: `badge badge--${ticket.status}`, text: statuses[ticket.status] || ticket.status })]);
  }
  function documentRow(doc) { return el("div", { class: "file-row" }, [el("div", {}, [el("strong", { text: doc.title || doc.name }), el("span", { text: `${fmtDate(doc.createdAt)}${doc.size ? ` · ${Math.ceil(doc.size / 1024)} KB` : ""}` })]), el("a", { class: "button button--line", href: `/api/portal/documents/${encodeURIComponent(doc.id)}`, text: "Baixar" })]); }
  function dialog(content) {
    const previousFocus = document.activeElement;
    const close = () => {
      modal.remove();
      root.inert = false;
      previousFocus?.focus();
    };
    const modal = el("div", {
      class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "dialog-title",
      onclick: event => { if (event.target === modal) close(); },
      onkeydown: event => {
        if (event.key === "Escape") return close();
        if (event.key !== "Tab") return;
        const controls = [...modal.querySelectorAll("a[href],button,input,textarea,select")]
          .filter(control => !control.disabled && control.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      },
    });
    const heading = content.title || el("h2", { text: "Detalhes" });
    heading.id = "dialog-title";
    const closeButton = el("button", { class: "close", type: "button", "aria-label": "Fechar", text: "×", onclick: close });
    modal.append(el("div", { class: "dialog__card" }, [
      el("div", { class: "dialog__head" }, [heading, closeButton]), content.body,
    ]));
    root.inert = true;
    document.body.append(modal);
    closeButton.focus();
    return close;
  }

  function renderOverview(host) {
    const tickets = dashboard.tickets || []; const docs = dashboard.documents || []; const rows = dashboard.control?.rows || [];
    const open = tickets.filter(t => t.status !== "concluido").length;
    const read = tickets.filter(t => t.unread).length;
    const requestAction = session.role === "client"
      ? button("Nova solicitação", "button--soft", () => requestDialog())
      : button("Ver solicitações", "button--soft", () => showView("tickets"));
    host.append(el("div", { class: "summary grid" }, [metric("Solicitações em curso", open, "Acompanhe o atendimento"), metric("Novas mensagens", read, read ? "Há atualizações para ler" : "Tudo em dia"), metric("Oportunidades", rows.length, dashboard.control ? `Atualizado ${fmtDate(dashboard.control.updatedAt)}` : "Controle ainda não importado"), metric("Documentos", docs.length, "Arquivos disponíveis")]), el("div", { class: "split grid" }, [section("Solicitações recentes", "Converse com a equipe e acompanhe cada demanda.", tickets.slice(0, 5).map(t => ticketItem(t, () => openTicket(t.id))), requestAction), section("Documentos disponíveis", "Propostas e arquivos compartilhados para você.", docs.slice(0, 5).map(documentRow), button("Ver documentos", "button--soft", () => showView("documents")))]));
    if (session.role === "admin") host.append(adminTools());
  }
  const metric = (label, value, hint) => el("article", { class: "card metric" }, [el("label", { text: label }), el("strong", { text: String(value) }), el("small", { text: hint })]);
  function section(heading, description, items, action) { return el("section", { class: "card" }, [el("div", { class: "section-head" }, [el("div", {}, [el("h2", { text: heading }), el("p", { text: description })]), action]), el("div", { class: heading.includes("Documentos") ? "doc-list" : "ticket-list" }, items.length ? items : [el("p", { class: "empty", text: "Nenhum item disponível neste momento." })])]); }
  function renderControl(host) {
    const control = dashboard.control; const rows = control?.rows || [];
    if (!control) { host.append(section("Controle Global", "A visão da planilha será disponibilizada aqui pela administração.", [], session.role === "admin" ? button("Importar controle", "button--primary", controlDialog) : null)); return; }
    const query = el("input", { type: "search", placeholder: "Buscar órgão, objeto ou número" }); const stage = el("select"); stage.append(el("option", { value: "", text: "Todas as etapas" })); [...new Set(rows.map(r => r.stage).filter(Boolean))].sort().forEach(value => stage.append(el("option", { value, text: value })));
    const table = el("tbody");
    const renderRows = () => {
      const term = query.value.trim().toLocaleLowerCase("pt-BR");
      const filtered = rows.filter(row => (!stage.value || row.stage === stage.value)
        && (!term || [row.object, row.agency, row.location, row.number, row.group].some(
          value => String(value || "").toLocaleLowerCase("pt-BR").includes(term),
        )));
      table.replaceChildren(...filtered.map(row => {
        const action = session.role === "client"
          ? button("Solicitar proposta", "button--soft", () => requestDialog(row))
          : button("Disponibilizar arquivo", "button--soft", () => uploadDialog({ opportunityId: row.id }));
        return el("tr", {}, [
          el("td", { text: row.object || "—" }), el("td", { text: row.agency || "—" }),
          el("td", { text: row.location || "—" }), el("td", { text: row.number || "—" }),
          el("td", { text: row.date || "—" }), el("td", { text: fmtMoney(row.value) }),
          el("td", { text: row.status || row.stage || "—" }),
          el("td", {}, row.url ? el("a", { href: row.url, target: "_blank", rel: "noopener", text: "Ver referência" }) : "—"),
          el("td", {}, action),
        ]);
      }));
      if (!filtered.length) table.append(el("tr", {}, el("td", { colspan: "9", class: "empty", text: "Nenhum resultado para os filtros aplicados." })));
    };
    query.addEventListener("input", renderRows); stage.addEventListener("change", renderRows);
    host.append(el("section", { class: "card" }, [el("div", { class: "section-head" }, [el("div", {}, [el("h2", { text: "Controle Global" }), el("p", { text: `Fonte atualizada ${fmtDate(control.sourceUpdatedAt || control.updatedAt)}` })]), session.role === "admin" ? button("Atualizar controle", "button--soft", controlDialog) : null]), el("div", { class: "toolbar" }, [query, stage]), el("div", { class: "table-wrap" }, el("table", { class: "control-table" }, [el("thead", {}, el("tr", {}, ["Objeto","Órgão","Local","Número","Data","Valor","Etapa","Referência","Ação"].map(text => el("th", { text })))), table]))])); renderRows();
  }
  function renderTickets(host) {
    const tickets = dashboard.tickets || [];
    const filter = (name, values) => el("select", { "aria-label": name }, [
      el("option", { value: "", text: name }),
      ...Object.entries(values).map(([value, text]) => el("option", { value, text })),
    ]);
    const category = filter("Todas as categorias", labels);
    const status = filter("Todos os status", statuses);
    const list = el("div", { class: "ticket-list" });
    const render = () => {
      const matches = tickets.filter(ticket => (!category.value || ticket.category === category.value)
        && (!status.value || ticket.status === status.value));
      list.replaceChildren(...(matches.length ? matches.map(ticket => ticketItem(ticket, () => openTicket(ticket.id)))
        : [el("p", { class: "empty", text: "Nenhuma solicitação para exibir." })]));
    };
    category.addEventListener("change", render);
    status.addEventListener("change", render);
    host.append(el("section", { class: "card" }, [
      el("div", { class: "section-head" }, [
        el("h2", { text: "Solicitações" }),
        session.role === "client" ? button("Nova solicitação", "button--primary", () => requestDialog()) : null,
      ]),
      el("div", { class: "toolbar" }, [category, status]), list,
    ]));
    render();
  }
  function renderDocuments(host) { const docs = dashboard.documents || []; host.append(section("Documentos", session.role === "admin" ? "Compartilhe arquivos vinculados a solicitações ou oportunidades." : "Baixe as propostas e documentos disponibilizados pela CONFENGE.", docs.map(documentRow), session.role === "admin" ? button("Disponibilizar documento", "button--primary", uploadDialog) : null)); }
  function adminTools() { const tools = dashboard.tools || {}; const children = [el("h2", { text: "Gestão" }), el("p", { text: "Acessos operacionais para a administração." })]; if (tools.twenty) children.push(el("a", { class: "button button--soft", href: tools.twenty, target: "_blank", rel: "noopener", text: "Abrir Twenty" })); if (tools.postiz) children.push(el("a", { class: "button button--soft", href: tools.postiz, target: "_blank", rel: "noopener", text: "Abrir Postiz" })); return el("section", { class: "card admin-tools" }, children); }

  async function openTicket(id) {
    try {
      const { ticket, messages } = await api(`/tickets/${encodeURIComponent(id)}`);
      const history = el("div", { class: "messages" }, messages.map(message => {
        const admin = message.role === "admin";
        return el("article", { class: `message message--${message.role}` }, [
          el("div", { text: message.body }),
          el("small", { text: `${admin ? "CONFENGE" : "Extra"} · ${fmtDate(message.createdAt)}` }),
        ]);
      }));
      const text = el("textarea", { required: "", maxlength: "5000", placeholder: "Escreva uma mensagem" });
      const send = button("Enviar mensagem", "button--primary", undefined, "submit");
      const form = el("form", { class: "message-form" }, [el("label", { text: "Nova mensagem" }, text), send]);
      const documents = dashboard.documents.filter(doc => doc.ticketId === id);
      const fileList = el("div", { class: "doc-list" }, [
        documents.length ? el("h3", { text: "Documentos da solicitação" }) : null,
        ...documents.map(documentRow),
        session.role === "admin" ? button("Disponibilizar documento", "button--soft", () => {
          close();
          uploadDialog({ ticketId: id, opportunityId: ticket.opportunityId });
        }) : null,
      ]);
      const body = el("div", {}, [
        el("p", { class: "form-note", text: `${labels[ticket.category]} · ${statuses[ticket.status]} · ${fmtDate(ticket.updatedAt)}` }),
        session.role === "admin" ? statusEditor(ticket) : null, history, fileList, form,
      ]);
      const close = dialog({ title: el("h2", { text: ticket.subject }), body });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        send.disabled = true;
        try {
          await api(`/tickets/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ body: text.value }) });
          close();
          await load();
          showView("tickets");
          await openTicket(id);
        } catch (error) {
          flash(errorMessage(error), form);
        } finally {
          send.disabled = false;
        }
      });
    } catch (error) {
      alert(errorMessage(error));
    }
  }
  function statusEditor(ticket) { const status = el("select"); Object.entries(statuses).forEach(([id, label]) => status.append(el("option", { value: id, text: label, ...(ticket.status === id ? { selected: "" } : {}) }))); const category = el("select"); Object.entries(labels).forEach(([id, label]) => category.append(el("option", { value: id, text: label, ...(ticket.category === id ? { selected: "" } : {}) }))); const save = button("Atualizar", "button--soft", async () => { try { await api(`/tickets/${encodeURIComponent(ticket.id)}`, { method: "PATCH", body: JSON.stringify({ status: status.value, category: category.value }) }); await load(); } catch (error) { alert(errorMessage(error)); } }); return el("div", { class: "status-row" }, [category, status, save]); }
  function requestDialog(row = {}) { const category = el("select"); Object.entries(labels).forEach(([id, label]) => category.append(el("option", { value: id, text: label }))); if (row.id) category.value = "proposta"; const subject = el("input", { required: "", value: row.object ? `Proposta · ${row.object}` : "", placeholder: "Assunto da solicitação" }); const body = el("textarea", { required: "", placeholder: "Conte o que você precisa e informe prazo ou documentos relevantes." }); const form = el("form", {}, [el("label", { text: "Categoria" }, category), el("label", { text: "Assunto" }, subject), el("label", { text: "Detalhes" }, body), button("Enviar solicitação", "button--primary", undefined, "submit")]); let close; form.addEventListener("submit", async event => { event.preventDefault(); try { await api("/tickets", { method: "POST", body: JSON.stringify({ category: category.value, subject: subject.value, body: body.value, opportunityId: row.id || undefined }) }); close(); await load(); showView("tickets"); } catch (error) { flash(errorMessage(error), form); } }); close = dialog({ title: el("h2", { text: row.id ? "Solicitar elaboração de proposta" : "Nova solicitação" }), body: form }); }
  function uploadDialog({ ticketId, opportunityId } = {}) {
    const file = el("input", { type: "file", required: "", accept: ".pdf,.zip,.docx,.xlsx,.csv" });
    const name = el("input", { required: "", maxlength: "220", placeholder: "Título para exibição" });
    const send = button("Disponibilizar arquivo", "button--primary", undefined, "submit");
    const form = el("form", {}, [el("label", { text: "Arquivo" }, file), el("label", { text: "Título" }, name), send]);
    const close = dialog({ title: el("h2", { text: "Disponibilizar documento" }), body: form });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const selected = file.files[0];
      if (!selected) return;
      send.disabled = true;
      try {
        await api("/documents", {
          method: "POST", body: selected,
          headers: {
            "Content-Type": selected.type || "application/octet-stream",
            "x-portal-filename": encodeURIComponent(selected.name),
            "x-portal-title": encodeURIComponent(name.value),
            ...(ticketId ? { "x-portal-ticket": encodeURIComponent(ticketId) } : {}),
            ...(opportunityId ? { "x-portal-opportunity": encodeURIComponent(opportunityId) } : {}),
          },
        });
        close();
        await load();
        showView(ticketId ? "tickets" : "documents");
        if (ticketId) await openTicket(ticketId);
      } catch (error) {
        flash(errorMessage(error), form);
      } finally {
        send.disabled = false;
      }
    });
  }
  function controlDialog() { const file = el("input", { type: "file", required: "", accept: ".json,application/json" }); const form = el("form", {}, [el("div", { class: "upload-zone", text: "Envie uma exportação JSON do Controle Global. O arquivo deve conter rows e os campos exibidos na grade." }), el("label", { text: "Arquivo JSON" }, file), button("Atualizar controle", "button--primary", undefined, "submit")]); let close; form.addEventListener("submit", async event => { event.preventDefault(); try { const text = await file.files[0].text(); await api("/control", { method: "POST", body: text }); close(); await load(); showView("control"); } catch (error) { flash(error.message.includes("JSON") ? "O arquivo precisa ser um JSON válido." : errorMessage(error), form); } }); close = dialog({ title: el("h2", { text: "Atualizar Controle Global" }), body: form }); }
  async function load() { dashboard = await api("/dashboard"); const app = shell(); const heading = el("div", {}, [el("span", { class: "eyebrow", text: session.role === "admin" ? "Administração CONFENGE" : "Extra Construtora" }), el("h1", { text: title }), el("p", { text: session.role === "admin" ? "Atendimentos, mensagens e documentos sob gestão." : "Sua central de oportunidades e atendimento." })]); const outlet = el("div"); app.content.append(el("header", { class: "topbar" }, [heading, session.role === "client" ? button("Solicitar serviço", "button--primary", () => requestDialog()) : null]), outlet);
    const render = id => { outlet.replaceChildren(); document.querySelectorAll(".nav button").forEach(item => item.removeAttribute("aria-current")); const index = ["overview","control","tickets","documents"].indexOf(id); app.nav.querySelectorAll("button")[index]?.setAttribute("aria-current", "page"); if (id === "overview") renderOverview(outlet); if (id === "control") renderControl(outlet); if (id === "tickets") renderTickets(outlet); if (id === "documents") renderDocuments(outlet); app.sidebar.classList.remove("is-open"); };
    window.showView = render; render("overview");
  }
  function showView(id) { window.showView?.(id); }
  async function start() { try { session = await api("/session"); if (session.role !== requestedRole) { await api("/logout", { method: "POST" }); return login(); } await load(); } catch { login(); } }
  start();
})();
