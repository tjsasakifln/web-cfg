(() => {
  "use strict";
  const root = document.querySelector("#portal-main");
  const isAdminPath = location.pathname.startsWith("/portal-interno/");
  const requestedRole = isAdminPath ? "admin" : "client";
  const title = isAdminPath ? "Intranet" : "Área do cliente";
  document.title = title + " | CONFENGE";
  const labels = {
    proposta: "Proposta",
    documentos: "Documentos",
    habilitacao: "Habilitação",
    orcamento: "Orçamento",
    contrato: "Contrato",
    outro: "Outros serviços",
  };
  const statuses = {
    aberto: "Aberto",
    em_analise: "Em análise",
    aguardando_cliente: "Aguardando cliente",
    concluido: "Concluído",
  };
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
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach((child) => node.append(child));
    return node;
  };
  const fmtDate = (value) => {
    if (!value) return "Sem atualização";
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? "Data não informada"
      : new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  };
  const errorMessage = (error) =>
    ({
      login_required: "Sua sessão terminou. Entre novamente para continuar.",
      forbidden: "Você não tem permissão para esta operação.",
      invalid_credentials: "Usuário ou senha incorretos. Confira os dados ou fale com a CONFENGE.",
      password_change_required: "Defina uma nova senha para continuar.",
      invalid_new_password: "Use pelo menos 14 caracteres e escolha uma senha diferente da temporária.",
      recovery_unavailable: "A recuperação por e-mail está temporariamente indisponível. Tente novamente em instantes.",
      recovery_cooldown: "Aguarde um pouco antes de solicitar outra confirmação. Se já recebeu o e-mail, use o link mais recente.",
      invalid_recovery_email: "Informe um e-mail válido.",
      retry_login: "O acesso foi atualizado. Volte para o login e tente novamente.",
      too_many_attempts: "Houve muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
      portal_unavailable: "O portal está temporariamente indisponível. Tente novamente em instantes.",
      invalid_field: "Confira se os campos obrigatórios estão preenchidos e dentro dos limites.",
      body_too_large: "O conteúdo ultrapassa o tamanho permitido.",
      unsupported_file: "Use um arquivo PDF, ZIP, DOCX, XLSX ou CSV.",
      invalid_file: "Não foi possível ler o arquivo. Confira o formato e tente novamente.",
      invalid_json: "O arquivo precisa ser um JSON válido.",
      invalid_control: "O arquivo do Controle Global não está no formato esperado.",
      stale_control: "Esta versão do Controle Global é mais antiga que a versão publicada.",
      upload_in_progress: "Há outro arquivo sendo enviado. Tente novamente em instantes.",
      unknown_opportunity: "Esta oportunidade não está mais disponível. Atualize a lista e tente novamente.",
      not_found: "O item solicitado não está disponível.",
      ticket_not_found: "A solicitação não está disponível.",
      document_not_found: "O documento não está disponível.",
    })[error?.body?.error] ||
    (error instanceof TypeError || error?.name === "TimeoutError"
      ? "Não foi possível conectar. Verifique sua conexão e tente novamente."
      : "Não foi possível concluir a operação. Tente novamente.");
  const fmtMoney = (value) =>
    typeof value === "number"
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        }).format(value)
      : value || "—";
  const api = async (path, options = {}) => {
    const response = await fetch(`/api/portal${path}`, {
      ...options,
      credentials: "same-origin",
      ...(!options.method && typeof AbortSignal.timeout === "function" ? { signal: AbortSignal.timeout(12000) } : {}),
      headers: {
        Accept: "application/json",
        ...(typeof options.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        body.error || "Não foi possível concluir a operação.",
      );
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  };
  const button = (text, kind = "button--primary", handler, type = "button") =>
    el("button", { class: `button ${kind}`, type, text, onclick: handler });
  const flash = (message, host) => {
    host.querySelector(".flash")?.remove();
    const note = el("p", { class: "flash", role: "alert", tabindex: "-1", text: message });
    host.prepend(note);
    note.focus();
    return note;
  };

  const supportHref = "https://wa.me/5548988344559?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20a%20%C3%81rea%20do%20Cliente%20da%20CONFENGE.";
  const normalize = (value) => String(value ?? "").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
  const link = (text, href, className) => el("a", { href, text, class: className });
  const paragraph = (text, className) => el("p", { text, class: className });
  const clearFlash = (host) => host.querySelector(":scope > .flash")?.remove();
  const field = (label, input, hint) => el("div", { class: "field" }, [
    el("label", {}, [el("span", { text: label }), input]),
    hint,
  ]);
  function passwordField(input, label, hint) {
    const toggle = button("Mostrar", "password-toggle", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.textContent = show ? "Ocultar" : "Mostrar";
      toggle.setAttribute("aria-label", (show ? "Ocultar " : "Mostrar ") + label.toLowerCase());
    });
    toggle.setAttribute("aria-label", "Mostrar " + label.toLowerCase());
    return el("div", { class: "field" }, [
      el("label", { for: input.id, text: label }),
      el("div", { class: "password-wrap" }, [input, toggle]),
      hint,
    ]);
  }
  const busy = (control, active, pending) => {
    if (active) control.dataset.idleText = control.textContent;
    control.disabled = active;
    control.textContent = active ? pending : control.dataset.idleText;
  };
  const clientStatus = (value) => !isAdminPath && value === "aguardando_cliente"
    ? "Aguardando sua resposta"
    : statuses[value] || value;
  const taskDefinitions = [
    ["tickets", "Solicitações", "Envie um pedido e acompanhe as respostas da CONFENGE.", "↗"],
    ["documents", "Documentos", "Encontre e baixe propostas e arquivos compartilhados.", "↓"],
    ["control", "Oportunidades", "Consulte o Controle Global e peça uma proposta para uma oportunidade.", "≡"],
  ];
  let app = null;
  let view = "overview";
  let dashboardRefresh = 0;
  let entryNavigation = 0;
  let openingTicket = false;
  let activeDialog = null;
  const filters = { tickets: {}, documents: {}, control: {} };

  function login(message = "", usernameValue = "", focus = false) {
    app = null;
    const username = el("input", {
      id: "portal-username", name: "username", required: "", maxlength: "256",
      autocomplete: "username", autocapitalize: "none", spellcheck: "false", value: usernameValue,
    });
    const password = el("input", {
      id: "portal-password", name: "password", type: "password", required: "",
      maxlength: "256", autocomplete: "current-password",
    });
    const activation = isAdminPath ? el("input", {
      name: "activationCode", autocomplete: "one-time-code", maxlength: "256",
    }) : null;
    const submit = button("Entrar", "button--primary login-submit", undefined, "submit");
    const form = el("form", { method: "post", action: "/api/portal/login" }, [
      field("Usuário", username),
      passwordField(password, "Senha"),
      activation ? field("Código de ativação (primeiro acesso)", activation) : null,
      submit,
      !isAdminPath ? button("Esqueci minha senha", "button--text", () => recoveryRequest()) : null,
    ]);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      clearFlash(form);
      busy(submit, true, "Entrando…");
      try {
        session = await api("/login", {
          method: "POST",
          body: JSON.stringify({
            role: requestedRole, username: username.value.trim(), password: password.value,
            ...(activation ? { activationCode: activation.value } : {}),
          }),
        });
      } catch (error) {
        if (error.status === 409 && error.body.error === "password_change_required") {
          passwordChange(form, username.value, password.value, activation?.value);
        } else {
          flash(errorMessage(error), form);
        }
      } finally {
        busy(submit, false);
      }
      if (session) await enterDashboard();
    });
    const heading = el("h1", { text: title, tabindex: "-1" });
    root.replaceChildren(el("div", { class: "login" }, [
      el("div", { class: "login__brand" }, [
        link("CONFENGE", "/", "portal-wordmark"),
        el("div", { class: "login-intro" }, [
          paragraph(isAdminPath ? "Portal interno" : "Portal de atendimento", "eyebrow"),
          heading,
          paragraph(isAdminPath
            ? "Gerencie os atendimentos e disponibilize documentos."
            : "Acompanhe solicitações, baixe documentos e consulte oportunidades em um só lugar."),
        ]),
        link("← Voltar ao site", "/", "return-site"),
      ]),
      el("div", { class: "login__content" }, el("section", { class: "login-card", "aria-labelledby": "login-heading" }, [
        el("h2", { id: "login-heading", text: "Entre na sua conta" }),
        paragraph("Use o usuário e a senha fornecidos pela CONFENGE.", "login-lead"),
        form,
        el("div", { class: "access-guide" }, [
          el("details", { open: "" }, [
            el("summary", { text: "Primeiro acesso" }),
            paragraph(isAdminPath
              ? "Entre com a senha temporária e o código de ativação. Na sequência, escolha uma nova senha."
              : "Entre com a senha temporária que você recebeu. Na próxima tela, crie sua senha definitiva."),
          ]),
          el("div", { class: "access-help" }, [
            el("strong", { text: isAdminPath ? "Não conseguiu entrar?" : "Não recebeu acesso ou ainda não confirmou seu e-mail?" }),
            paragraph("Peça ajuda à equipe da CONFENGE. Não envie sua senha."),
            link("Falar com o suporte pelo WhatsApp", supportHref),
          ]),
        ]),
      ])),
    ]));
    if (message) flash(message, form);
    else if (focus) heading.focus();
  }

  function passwordChange(host, user, currentPassword, activationCode) {
    const next = el("input", {
      id: "portal-new-password", name: "newPassword", type: "password",
      required: "", minlength: "14", maxlength: "256", autocomplete: "new-password",
      "aria-describedby": "password-rules",
    });
    const confirmation = el("input", {
      id: "portal-confirm-password", name: "confirmPassword", type: "password",
      required: "", minlength: "14", maxlength: "256", autocomplete: "new-password",
    });
    const submit = button("Criar senha e entrar", "button--primary login-submit", undefined, "submit");
    const form = el("form", { method: "post", action: "/api/portal/login" }, [
      el("input", { type: "text", hidden: "", name: "username", autocomplete: "username", value: user }),
      passwordField(next, "Nova senha", el("p", {
        id: "password-rules", class: "form-note",
        text: "Use pelo menos 14 caracteres e escolha uma senha diferente da temporária.",
      })),
      passwordField(confirmation, "Confirme a nova senha"),
      submit,
      button("Voltar para o login", "button--line", () => login("", user, true)),
    ]);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      clearFlash(form);
      if (next.value.trim().length < 14 || next.value === currentPassword) {
        return flash("Use pelo menos 14 caracteres e escolha uma senha diferente da temporária.", form);
      }
      if (next.value !== confirmation.value) return flash("As duas senhas precisam ser iguais.", form);
      busy(submit, true, "Criando senha…");
      try {
        session = await api("/login", {
          method: "POST",
          body: JSON.stringify({ role: requestedRole, username: user, password: currentPassword,
            activationCode, newPassword: next.value }),
        });
      } catch (error) {
        flash(errorMessage(error), form);
      } finally {
        busy(submit, false);
      }
      if (session) await enterDashboard();
    });
    const card = host.closest(".login-card");
    card.querySelector("h2").textContent = "Crie sua senha definitiva";
    card.querySelector(".login-lead").textContent = "Esta etapa é necessária apenas no primeiro acesso.";
    host.replaceWith(form);
    next.focus();
  }

  const sections = [
    ["overview", "Início", ""],
    ["tickets", "Solicitações", "solicitacoes"],
    ["documents", "Documentos", "documentos"],
    ["control", isAdminPath ? "Controle Global" : "Oportunidades", "oportunidades"],
  ];
  const currentView = () => sections.find(([, , hash]) => "#" + hash === location.hash)?.[0] || "overview";
  function shell() {
    const nav = el("nav", { class: "nav", "aria-label": "Navegação do portal" });
    sections.forEach(([id, label, hash]) => {
      const anchor = link(label, hash ? "#" + hash : location.pathname);
      anchor.dataset.view = id;
      anchor.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        showView(id);
      });
      nav.append(anchor);
    });
    const signOut = button("Sair", "button--line", async () => {
      busy(signOut, true, "Saindo…");
      try {
        await api("/logout", { method: "POST" });
        endSession("Você saiu da sua conta.");
      } catch (error) {
        if (error.status === 401) return endSession("Você saiu da sua conta.");
        notify("Não foi possível sair. Verifique sua conexão e tente novamente.");
      } finally {
        busy(signOut, false);
      }
    });
    const sidebar = el("aside", { class: "sidebar" }, [
      el("div", { class: "sidebar__top" }, [
        link("CONFENGE", "/", "portal-wordmark"),
        el("div", { class: "account", text: isAdminPath ? "Administração" : session.username }),
        signOut,
      ]),
      nav,
      link("Ajuda com o portal", supportHref, "sidebar-help"),
    ]);
    const content = el("div", { class: "content" });
    root.replaceChildren(el("div", { class: "app" }, [sidebar, content]));
    return { content, nav };
  }

  function ticketItem(ticket, click) {
    const title = ticket.subject || labels[ticket.category] || "Solicitação";
    return el("button", {
      class: "ticket", type: "button", "data-ticket": ticket.id, onclick: (event) => click(event.currentTarget),
    }, [
      el("div", { class: "ticket__main" }, [
        el("strong", { text: title }),
        el("span", { text: `${labels[ticket.category] || ticket.category} · ${fmtDate(ticket.updatedAt)}` }),
      ]),
      el("div", { class: "ticket__signals" }, [
        el("span", { class: `badge badge--${ticket.status}`, text: clientStatus(ticket.status) }),
        ticket.unread ? el("span", { class: "unread-label", text: "Mensagem nova" }) : null,
      ]),
    ]);
  }
  function documentRow(doc) {
    const heading = doc.title || doc.name;
    const type = doc.name?.split(".").at(-1)?.toUpperCase();
    const details = [type, doc.size ? Math.ceil(doc.size / 1024) + " KB" : "", fmtDate(doc.createdAt)].filter(Boolean).join(" · ");
    const entry = el("div", { class: "file-row" });
    const download = button("Baixar", "button--line", async () => {
      const owner = session;
      busy(download, true, "Baixando…");
      try {
        const response = await fetch(`/api/portal/documents/${encodeURIComponent(doc.id)}`, { credentials: "same-origin" });
        if (!response.ok) {
          const error = new Error();
          error.status = response.status;
          error.body = await response.json().catch(() => ({}));
          throw error;
        }
        const blob = await response.blob();
        if (session !== owner) return;
        const objectURL = URL.createObjectURL(blob);
        const save = el("a", { href: objectURL, download: doc.name || heading });
        document.body.append(save);
        save.click();
        save.remove();
        setTimeout(() => URL.revokeObjectURL(objectURL), 15000);
      } catch (error) {
        if (session === owner) operationError(error, entry.closest(".dialog__card") || undefined);
      } finally {
        busy(download, false);
      }
    });
    download.setAttribute("aria-label", "Baixar " + heading);
    entry.append(el("div", { class: "file-info" }, [
      el("strong", { text: heading }), el("span", { text: details }),
    ]), download);
    return entry;
  }
  function dialog(content) {
    if (activeDialog) activeDialog(false);
    const skip = document.querySelector(".skip-link");
    const previousFocus = document.activeElement;
    const close = (restore = true) => {
      if (!modal.isConnected) return;
      modal.remove();
      activeDialog = null;
      root.inert = false;
      if (skip) skip.inert = false;
      document.documentElement.classList.remove("has-dialog");
      if (restore !== false) {
        previousFocus?.focus();
        content.onClose?.();
      }
    };
    const modal = el("div", {
      class: "dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "dialog-title",
      onclick: (event) => {
        if (event.target === modal) close();
      },
      onkeydown: (event) => {
        if (event.key === "Escape") return close();
        if (event.key !== "Tab") return;
        const controls = [
          ...modal.querySelectorAll("a[href],button,input,textarea,select"),
        ].filter(
          (control) => !control.disabled && control.getClientRects().length,
        );
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
    const closeButton = el("button", {
      class: "close",
      type: "button",
      "aria-label": "Fechar",
      text: "×",
      onclick: close,
    });
    modal.append(
      el("div", { class: "dialog__card" }, [
        el("div", { class: "dialog__head" }, [heading, closeButton]),
        content.body,
      ]),
    );
    root.inert = true;
    if (skip) skip.inert = true;
    document.documentElement.classList.add("has-dialog");
    document.body.append(modal);
    activeDialog = close;
    closeButton.focus();
    return close;
  }

  function renderOverview(host) {
    const tickets = dashboard.tickets || [];
    const docs = dashboard.documents || [];
    const pending = tickets.filter((t) => t.status === "aguardando_cliente").length;
    const unread = tickets.filter((t) => t.unread).length;
    const open = tickets.filter((t) => t.status !== "concluido").length;
    const action = isAdminPath
      ? button("Ver solicitações", "button--line", () => showView("tickets"))
      : button("Nova solicitação", "button--primary", () => requestDialog());
    host.append(...[
      el("section", { class: "welcome" }, [
        el("div", {}, [
          paragraph(isAdminPath ? "Painel de atendimento" : "Atendimento CONFENGE", "eyebrow"),
          el("h1", { text: title, tabindex: "-1" }),
          paragraph(isAdminPath ? "Acompanhe atendimentos, mensagens e documentos."
            : "Envie pedidos à equipe, acompanhe as respostas e encontre os arquivos compartilhados com você."),
        ]),
        action,
      ]),
      !isAdminPath && dashboard.recovery?.available && !dashboard.recovery.email
        ? el("section", { class: "recovery-reminder" }, [
            el("div", {}, [el("h2", { text: "Proteja seu acesso" }),
              paragraph("Confirme um e-mail agora para redefinir sua senha sem falar com o suporte.")]),
            button("Configurar e-mail de recuperação", "button--line", openRecoverySettings),
          ]) : null,
      !isAdminPath && (pending || unread)
        ? el("section", { class: "attention" }, [
            el("h2", { text: "Para acompanhar" }),
            pending ? button(pending === 1 ? "1 solicitação aguarda sua resposta" : pending + " solicitações aguardam sua resposta", "button--line", () => {
              Object.assign(filters.tickets, { query: "", category: "", status: "aguardando_cliente", unread: false });
              showView("tickets");
            }) : null,
            unread ? button(unread === 1 ? "1 conversa com mensagem nova" : unread + " conversas com mensagens novas", "button--line", () => {
              Object.assign(filters.tickets, { query: "", category: "", status: "", unread: true });
              showView("tickets");
            }) : null,
          ]) : null,
      el("section", { class: "quickstart", "aria-labelledby": "portal-tasks" }, [
        el("h2", { id: "portal-tasks", text: "O que você quer fazer?" }),
        el("div", { class: "task-grid" }, taskDefinitions.map(([id, label, description, icon]) => {
          const count = id === "tickets" ? (open ? open + " em andamento" : "Nenhuma em andamento")
            : id === "documents" ? docs.length + (docs.length === 1 ? " arquivo disponível" : " arquivos disponíveis")
            : dashboard.control ? dashboard.control.rows.length + (dashboard.control.rows.length === 1 ? " oportunidade" : " oportunidades") : "Nenhuma lista publicada";
          const task = link("", "#" + sections.find(([section]) => id === section)[2], "task-card");
          task.append(el("span", { class: "task-icon", text: icon, "aria-hidden": "true" }),
            el("strong", { text: label }), el("span", { text: description }),
            el("small", { text: count }));
          return task;
        })),
      ]),
      el("div", { class: "split grid" }, [
        section("Solicitações recentes", "Abra uma solicitação para ler a conversa e responder.",
          tickets.slice(0, 4).map((t) => ticketItem(t, (trigger) => openTicket(t.id, trigger))),
          !tickets.length && !isAdminPath ? button("Criar primeira solicitação", "button--line", () => requestDialog())
            : tickets.length ? button("Ver todas", "button--line", () => showView("tickets")) : null,
          "Nenhuma solicitação ainda. Os pedidos enviados aparecem aqui."),
        section("Documentos recentes", "Propostas e arquivos compartilhados pela CONFENGE.",
          docs.slice(0, 4).map(documentRow),
          docs.length ? button("Ver todos", "button--line", () => showView("documents")) : null,
          "Ainda não há documentos compartilhados."),
      ]),
    ].filter(Boolean));
    if (isAdminPath) host.append(adminTools());
  }

  function section(heading, description, items, action, empty) {
    return el("section", { class: "card" }, [
      el("div", { class: "section-head" }, [
        el("div", {}, [el("h2", { text: heading }), paragraph(description)]),
        action,
      ]),
      el("div", { class: "item-list" }, items.length ? items : paragraph(empty, "empty")),
    ]);
  }

  function pageHeading(title, description, action) {
    return el("header", { class: "page-heading" }, [
      el("div", {}, [el("h1", { text: title, tabindex: "-1" }), paragraph(description)]),
      action,
    ]);
  }
  const searchBox = (id, label, placeholder, value = "") =>
    el("input", { id, type: "search", placeholder, value, "aria-label": label });
  function summaryLine() {
    return el("p", { class: "result-count", role: "status" });
  }

  function renderControl(host) {
    const control = dashboard.control;
    const rows = control?.rows || [];
    const heading = isAdminPath ? "Controle Global" : "Oportunidades";
    const action = isAdminPath
      ? button(control ? "Atualizar controle" : "Importar controle", "button--primary", controlDialog) : null;
    host.append(pageHeading(heading, "Consulte as oportunidades do Controle Global e os dados de referência.", action));
    if (!control) {
      host.append(section("Nenhuma oportunidade publicada",
        isAdminPath ? "Importe o Controle Global para disponibilizar a consulta." : "Quando a CONFENGE compartilhar o Controle Global, você poderá consultar as oportunidades aqui.",
        [], null, "A lista ainda não está disponível."));
      return;
    }
    const state = filters.control;
    const query = searchBox("control-search", "Buscar oportunidades", "Órgão, objeto, local ou número", state.query);
    const stage = el("select", { id: "control-stage", "aria-label": "Etapa da oportunidade" }, [
      el("option", { value: "", text: "Todas as etapas" }),
      ...[...new Set(rows.map((r) => r.stage).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((value) => el("option", { value, text: value })),
    ]);
    stage.value = state.stage || "";
    if (stage.selectedIndex === -1) stage.value = "";
    const count = summaryLine();
    const list = el("ul", { class: "opportunity-list" });
    const pagination = el("div", { class: "pagination" });
    const pageSize = 20;
    let page = 0;
    const detail = (name, value) => value && el("div", {}, [
      el("dt", { text: name }), el("dd", { text: value }),
    ]);
    const renderRows = () => {
      const term = normalize(query.value);
      const matched = rows.filter((row) => (!stage.value || row.stage === stage.value)
        && (!term || [row.object, row.agency, row.location, row.number, row.group].some((v) => normalize(v).includes(term))));
      const totalPages = Math.max(1, Math.ceil(matched.length / pageSize));
      page = Math.min(page, totalPages - 1);
      const visible = matched.slice(page * pageSize, (page + 1) * pageSize);
      count.textContent = matched.length
        ? `Exibindo ${page * pageSize + 1}–${page * pageSize + visible.length} de ${matched.length}`
        : "Nenhuma oportunidade encontrada. Ajuste os filtros ou limpe a busca.";
      list.replaceChildren(...visible.map((row) => el("li", { class: "opportunity" }, [
        el("h2", { text: row.object }),
        el("dl", {}, [
          detail("Órgão", row.agency), detail("Local", row.location), detail("Número", row.number),
          detail("Data", row.date), detail("Valor", row.value ? fmtMoney(row.value) : ""),
          detail("Etapa", row.stage),
          row.status !== row.stage ? detail("Status", row.status) : null,
        ]),
        el("div", { class: "actions" }, [
          row.url ? el("a", {
            class: "button button--line", href: row.url, target: "_blank", rel: "noopener noreferrer",
            text: "Ver referência (nova aba)",
          }) : null,
          isAdminPath ? button("Disponibilizar arquivo", "button--soft", () => uploadDialog({ opportunityId: row.id }))
            : button("Pedir proposta", "button--soft", () => requestDialog(row)),
        ]),
      ])));
      const setPage = (target) => {
        page = target;
        renderRows();
        count.focus();
      };
      pagination.replaceChildren();
      if (totalPages > 1) {
        const previous = button("Anterior", "button--line", () => setPage(page - 1));
        const next = button("Próxima", "button--line", () => setPage(page + 1));
        previous.disabled = page === 0;
        next.disabled = page + 1 === totalPages;
        pagination.append(previous, el("span", { text: `Página ${page + 1} de ${totalPages}` }), next);
      }
    };
    const update = () => {
      Object.assign(state, { query: query.value, stage: stage.value });
      page = 0;
      renderRows();
    };
    query.addEventListener("input", update);
    stage.addEventListener("change", update);
    count.tabIndex = -1;
    host.append(el("section", { class: "card" }, [
      paragraph(`Fonte atualizada em ${fmtDate(control.sourceUpdatedAt || control.updatedAt)}`, "form-note"),
      el("div", { class: "toolbar" }, [
        field("Buscar", query), field("Etapa", stage),
        button("Limpar filtros", "button--line", () => { query.value = ""; stage.value = ""; update(); query.focus(); }),
      ]),
      count, list, pagination,
    ]));
    renderRows();
  }

  function renderTickets(host) {
    const tickets = dashboard.tickets || [];
    const state = filters.tickets;
    host.append(pageHeading("Solicitações", "Abra um pedido para acompanhar o andamento, responder à equipe e consultar os documentos relacionados.",
      !isAdminPath ? button("Nova solicitação", "button--primary", () => requestDialog()) : null));
    if (!tickets.length) {
      host.append(section("Nenhuma solicitação ainda", "Os pedidos enviados ficam organizados aqui.",
        [], null, isAdminPath ? "Acompanhe por aqui as solicitações recebidas." : "Selecione Nova solicitação para contar à CONFENGE o que você precisa."));
      return;
    }
    const filter = (name, all, values, defaultValue) => {
      const select = el("select", { "aria-label": name }, [
        el("option", { value: "", text: all }),
        ...Object.entries(values).map(([value, text]) => el("option", { value, text })),
      ]);
      select.value = defaultValue || "";
      return select;
    };
    const query = searchBox("ticket-search", "Buscar solicitações", "Assunto da solicitação", state.query);
    const category = filter("Categoria", "Todas as categorias", labels, state.category);
    const status = filter("Status", "Todos os status",
      Object.fromEntries(Object.keys(statuses).map((key) => [key, clientStatus(key)])), state.status);
    const unread = el("input", { type: "checkbox" });
    unread.checked = Boolean(state.unread);
    const count = summaryLine();
    const list = el("div", { class: "ticket-list" });
    const render = () => {
      const matches = tickets.filter((ticket) => normalize(ticket.subject).includes(normalize(query.value))
        && (!category.value || ticket.category === category.value) && (!status.value || ticket.status === status.value)
        && (!unread.checked || ticket.unread));
      count.textContent = matches.length === 1 ? "1 solicitação" : matches.length + " solicitações";
      list.replaceChildren(...(matches.length ? matches.map((ticket) => ticketItem(ticket, (trigger) => openTicket(ticket.id, trigger)))
        : [paragraph("Nenhuma solicitação corresponde aos filtros. Ajuste a busca ou limpe os filtros.", "empty")]));
    };
    const update = () => {
      Object.assign(state, { query: query.value, category: category.value, status: status.value, unread: unread.checked });
      render();
    };
    query.addEventListener("input", update);
    [category, status, unread].forEach((input) => input.addEventListener("change", update));
    host.append(el("section", { class: "card" }, [
      el("div", { class: "toolbar" }, [
        field("Buscar", query), field("Categoria", category), field("Status", status),
        button("Limpar filtros", "button--line", () => {
          query.value = category.value = status.value = ""; unread.checked = false; update(); query.focus();
        }),
      ]),
      el("label", { class: "check-filter" }, [unread, el("span", { text: "Só com mensagens novas" })]),
      count, list,
    ]));
    render();
  }

  function renderDocuments(host) {
    const docs = dashboard.documents || [];
    const state = filters.documents;
    host.append(pageHeading("Documentos", "Consulte e baixe os arquivos disponibilizados pela CONFENGE.",
      isAdminPath ? button("Disponibilizar documento", "button--primary", uploadDialog) : null));
    if (!docs.length) {
      host.append(section("Nenhum documento compartilhado", "Propostas e arquivos aparecerão aqui quando forem disponibilizados.",
        [], null, "Se precisar de um arquivo, abra uma solicitação."));
      if (!isAdminPath) host.append(button("Solicitar um documento", "button--line", () => requestDialog({}, "documentos")));
      return;
    }
    const query = searchBox("document-search", "Buscar documentos", "Título ou nome do arquivo", state.query);
    const count = summaryLine();
    const list = el("div", { class: "doc-list" });
    const render = () => {
      state.query = query.value;
      const term = normalize(query.value);
      const matches = docs.filter((doc) => normalize(doc.title).includes(term) || normalize(doc.name).includes(term));
      count.textContent = matches.length === 1 ? "1 documento" : matches.length + " documentos";
      list.replaceChildren(...(matches.length ? matches.map(documentRow)
        : [paragraph("Nenhum arquivo corresponde à busca. Tente outro nome ou limpe a busca.", "empty")]));
    };
    query.addEventListener("input", render);
    host.append(el("section", { class: "card" }, [
      el("div", { class: "toolbar" }, [field("Buscar", query),
        button("Limpar busca", "button--line", () => { query.value = ""; render(); query.focus(); })]),
      count, list,
    ]));
    render();
  }

  function adminTools() {
    const tools = dashboard.tools || {};
    const children = [
      el("h2", { text: "Gestão" }),
      el("p", { text: "Acessos operacionais para a administração." }),
    ];
    if (tools.twenty)
      children.push(
        el("a", {
          class: "button button--soft",
          href: tools.twenty,
          target: "_blank",
          rel: "noopener",
          text: "Abrir Twenty",
        }),
      );
    if (tools.postiz)
      children.push(
        el("a", {
          class: "button button--soft",
          href: tools.postiz,
          target: "_blank",
          rel: "noopener",
          text: "Abrir Postiz",
        }),
      );
    return el("section", { class: "card admin-tools" }, children);
  }

  const messageRow = (message) => {
    const admin = message.role === "admin";
    const author = message.role === requestedRole ? "Você" : admin ? "CONFENGE" : "Cliente";
    return el("article", { class: `message message--${message.role}${message.role === requestedRole ? " message--own" : ""}` }, [
      el("div", { text: message.body }),
      el("small", { text: `${author} · ${fmtDate(message.createdAt)}` }),
    ]);
  };
  async function openTicket(id, trigger) {
    if (openingTicket || activeDialog) return;
    openingTicket = true;
    const owner = session;
    const launchView = view;
    const revision = dashboardRefresh;
    if (trigger) trigger.setAttribute("aria-busy", "true");
    notify("Abrindo solicitação…");
    try {
      const { ticket, messages } = await api(`/tickets/${encodeURIComponent(id)}`);
      if (session !== owner) return;
      const previous = dashboard.tickets.find((item) => item.id === id);
      if (previous) Object.assign(previous, ticket, { unread: false });
      if (view === launchView) notify("");
      if (activeDialog || view !== launchView || dashboardRefresh !== revision) return;
      const history = el("div", { class: "messages", "aria-label": "Histórico de mensagens" }, messages.map(messageRow));
      const text = el("textarea", {
        required: "", maxlength: "5000", placeholder: "Escreva sua resposta à equipe",
      });
      const send = button("Enviar mensagem", "button--primary", undefined, "submit");
      const sent = el("p", { class: "dialog-status", role: "status" });
      const form = el("form", { class: "message-form" }, [field("Sua mensagem", text), send, sent]);
      const documents = dashboard.documents.filter((doc) => doc.ticketId === id);
      const fileList = el("div", { class: "doc-list" }, [
        documents.length ? el("h3", { text: "Documentos desta solicitação" }) : null,
        ...documents.map(documentRow),
        isAdminPath ? button("Disponibilizar documento", "button--soft", () => {
          close(); uploadDialog({ ticketId: id, opportunityId: ticket.opportunityId });
        }) : null,
      ]);
      const statusLabel = paragraph("", "ticket-context");
      const updateContext = () => {
        statusLabel.textContent = `${labels[ticket.category]} · ${clientStatus(ticket.status)} · ${fmtDate(ticket.updatedAt)}`;
      };
      updateContext();
      const body = el("div", {}, [
        statusLabel,
        !isAdminPath && ticket.status === "aguardando_cliente"
          ? paragraph("A equipe aguarda sua resposta. Leia a conversa e escreva no campo abaixo.", "next-step") : null,
        isAdminPath ? statusEditor(ticket, updateContext) : null,
        el("h3", { text: "Conversa" }), history, fileList, form,
      ]);
      const close = dialog({ title: el("h2", { text: ticket.subject }), body, onClose: () => {
        if (session !== owner || view !== launchView || !app) return;
        renderView(view);
        const row = [...app.outlet.querySelectorAll("[data-ticket]")].find((item) => item.dataset.ticket === id);
        (row || app.outlet.querySelector("h1"))?.focus();
      } });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (send.disabled) return;
        clearFlash(form);
        sent.textContent = "";
        const value = text.value.trim();
        if (!value) return flash("Escreva uma mensagem antes de enviar.", form);
        busy(send, true, "Enviando…");
        try {
          const answer = await api(`/tickets/${encodeURIComponent(id)}/messages`, {
            method: "POST", body: JSON.stringify({ body: value }),
          });
          if (session !== owner) return;
          const createdAt = answer.createdAt || new Date().toISOString();
          history.append(messageRow({ role: requestedRole, body: value, createdAt }));
          Object.assign(ticket, { updatedAt: createdAt, unread: false });
          if (previous) Object.assign(previous, ticket);
          dashboard.tickets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          updateContext();
          text.value = "";
          sent.textContent = "Mensagem enviada.";
          text.focus();
        } catch (error) {
          operationError(error, form);
        } finally {
          busy(send, false);
        }
      });
    } catch (error) {
      if (session === owner) operationError(error);
    } finally {
      openingTicket = false;
      trigger?.removeAttribute("aria-busy");
    }
  }
  function statusEditor(ticket, updateContext) {
    const select = (name, values, selected) => el("select", { "aria-label": name },
      Object.entries(values).map(([id, label]) => el("option", {
        value: id, text: label, selected: id === selected ? "" : null,
      })));
    const status = select("Status da solicitação", statuses, ticket.status);
    const category = select("Categoria da solicitação", labels, ticket.category);
    const feedback = el("span", { role: "status" });
    const save = button("Salvar alterações", "button--soft", async () => {
      busy(save, true, "Salvando…");
      try {
        await api(`/tickets/${encodeURIComponent(ticket.id)}`, {
          method: "PATCH", body: JSON.stringify({ status: status.value, category: category.value }),
        });
        const updated = dashboard?.tickets.find((item) => item.id === ticket.id);
        Object.assign(ticket, { status: status.value, category: category.value });
        if (updated) Object.assign(updated, ticket);
        updateContext();
        feedback.textContent = "Alterações salvas.";
      } catch (error) {
        if (error.status === 401) endSession(errorMessage(error));
        else feedback.textContent = errorMessage(error);
      } finally {
        busy(save, false);
      }
    });
    return el("div", { class: "status-row" }, [category, status, save, feedback]);
  }
  function requestDialog(row = {}, preset = "") {
    const category = el("select", { required: "" }, [
      el("option", { value: "", text: "Selecione o tipo de solicitação" }),
      ...Object.entries(labels).map(([id, label]) => el("option", { value: id, text: label })),
    ]);
    category.value = row.id ? "proposta" : preset;
    const subject = el("input", { required: "", maxlength: "200",
      value: row.object ? `Proposta · ${row.object}`.slice(0, 200) : "", placeholder: "Ex.: revisão de proposta" });
    const body = el("textarea", { required: "", maxlength: "5000",
      placeholder: "Descreva o que precisa e inclua o prazo, se já souber." });
    const send = button("Enviar solicitação", "button--primary", undefined, "submit");
    const form = el("form", {}, [
      paragraph("Após o envio, acompanhe o andamento e as respostas na seção Solicitações.", "form-note"),
      row.object ? el("p", { class: "next-step", text: "Oportunidade vinculada — " + row.object }) : null,
      field("Categoria", category), field("Assunto", subject), field("Detalhes", body),
      el("div", { class: "actions" }, [send, button("Cancelar", "button--line", () => close())]),
    ]);
    const owner = session;
    const close = dialog({
      title: el("h2", { text: row.id ? "Pedir proposta" : "Nova solicitação" }),
      body: form,
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (send.disabled) return;
      clearFlash(form);
      if (!subject.value.trim() || !body.value.trim()) return flash("Preencha o assunto e conte o que você precisa.", form);
      busy(send, true, "Enviando…");
      try {
        const { id } = await api("/tickets", {
          method: "POST", body: JSON.stringify({
            category: category.value, subject: subject.value.trim(), body: body.value.trim(),
            opportunityId: row.id || undefined,
          }),
        });
        if (session !== owner) return;
        close();
        dashboard.tickets.unshift({ id, category: category.value, subject: subject.value.trim(), status: "aberto",
          updatedAt: new Date().toISOString(), opportunityId: row.id || null, unread: false });
        filters.tickets = {};
        showView("tickets");
        notify("Solicitação enviada. Abra o pedido abaixo para acompanhar a resposta da CONFENGE.");
      } catch (error) {
        operationError(error, form);
      } finally {
        busy(send, false);
      }
    });
  }

  function uploadDialog({ ticketId, opportunityId } = {}) {
    const file = el("input", {
      type: "file",
      required: "",
      accept: ".pdf,.zip,.docx,.xlsx,.csv",
    });
    const name = el("input", {
      required: "",
      maxlength: "220",
      placeholder: "Título para exibição",
    });
    const send = button(
      "Disponibilizar arquivo",
      "button--primary",
      undefined,
      "submit",
    );
    const form = el("form", {}, [
      field("Arquivo (até 20 MB)", file),
      field("Título", name),
      send,
    ]);
    const close = dialog({
      title: el("h2", { text: "Disponibilizar documento" }),
      body: form,
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selected = file.files[0];
      if (!selected || send.disabled) return;
      if (selected.size > 20 * 1024 * 1024) return flash("O arquivo deve ter até 20 MB.", form);
      send.disabled = true;
      try {
        await api("/documents", {
          method: "POST",
          body: selected,
          headers: {
            "Content-Type": selected.type || "application/octet-stream",
            "x-portal-filename": encodeURIComponent(selected.name),
            "x-portal-title": encodeURIComponent(name.value),
            ...(ticketId
              ? { "x-portal-ticket": encodeURIComponent(ticketId) }
              : {}),
            ...(opportunityId
              ? { "x-portal-opportunity": encodeURIComponent(opportunityId) }
              : {}),
          },
        });
        close();
        await load();
        showView(ticketId ? "tickets" : "documents");
        if (ticketId) await openTicket(ticketId);
      } catch (error) {
        operationError(error, form.isConnected ? form : undefined);
      } finally {
        send.disabled = false;
      }
    });
  }
  function controlDialog() {
    const file = el("input", {
      type: "file",
      required: "",
      accept: ".json,application/json",
    });
    const submit = button("Atualizar controle", "button--primary", undefined, "submit");
    const form = el("form", {}, [
      el("div", {
        class: "upload-zone",
        text: "Envie uma exportação JSON do Controle Global. O arquivo deve conter rows e os campos exibidos na grade.",
      }),
      el("label", { text: "Arquivo JSON" }, file),
      submit,
    ]);
    let close;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      if (file.files[0].size > 2 * 1024 * 1024) return flash("O arquivo deve ter até 2 MB.", form);
      busy(submit, true, "Atualizando…");
      try {
        const text = await file.files[0].text();
        await api("/control", { method: "POST", body: text });
        close();
        await load();
        showView("control");
      } catch (error) {
        operationError(error, form.isConnected ? form : undefined);
      } finally {
        busy(submit, false);
      }
    });
    close = dialog({
      title: el("h2", { text: "Atualizar Controle Global" }),
      body: form,
    });
  }
  function recoveryPage(heading, description, form) {
    const title = el("h1", { text: heading, tabindex: "-1" });
    root.replaceChildren(el("section", { class: "startup recovery-page" }, [
      title, paragraph(description), form,
      el("div", { class: "startup-links" }, [
        button("Voltar ao login", "button--line", () => login("", "", true)),
        link("Ainda precisa de ajuda?", supportHref),
      ]),
    ]));
    title.focus();
  }
  const recoveryEmailField = (value = "") => el("input", {
    name: "email", id: "portal-recovery-email", type: "email", autocomplete: "email",
    required: "", maxlength: "254", value, autocapitalize: "none", spellcheck: "false",
  });
  const recoveryPost = (path, data) => api("/recovery/" + path, {
    method: "POST", body: JSON.stringify(data),
  });
  function recoveryRequest(initialEmail = "") {
    const email = recoveryEmailField(initialEmail);
    const submit = button("Enviar link de recuperação", "button--primary", undefined, "submit");
    const form = el("form", { method: "post", action: "/api/portal/recovery/request" }, [
      field("E-mail de recuperação cadastrado", email), submit,
    ]);
    recoveryPage("Recuperar acesso", "Informe o e-mail que você confirmou na Área do Cliente.", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      clearFlash(form);
      busy(submit, true, "Solicitando link…");
      try {
        await recoveryPost("request", { email: email.value.trim() });
        recoveryPage("Confira sua caixa de entrada",
          "Se o endereço estiver cadastrado, você receberá um link válido por 30 minutos. Confira também o spam. Depois de criar uma nova senha, volte ao login.",
          button("Informar outro e-mail", "button--line", () => recoveryRequest(email.value)));
      } catch (error) {
        flash(errorMessage(error), form);
      } finally {
        busy(submit, false);
      }
    });
  }
  function openRecoverySettings() {
    const address = dashboard?.recovery?.email;
    const email = recoveryEmailField();
    const password = el("input", {
      id: "portal-recovery-password", name: "password", type: "password",
      autocomplete: "current-password", required: "", maxlength: "256",
    });
    const submit = button("Enviar confirmação", "button--primary", undefined, "submit");
    const parent = el("div");
    const form = el("form", { method: "post", action: "/api/portal/recovery/email" }, [
      paragraph(address ? "E-mail confirmado — " + address + ". O endereço atual continua válido até você confirmar o novo." :
        "Cadastre um endereço que você possa acessar mesmo se esquecer a senha do portal.", "form-note"),
      field(address ? "Novo e-mail de recuperação" : "Seu e-mail de recuperação", email),
      passwordField(password, "Sua senha atual"), submit,
    ]);
    parent.append(form);
    const close = dialog({ title: el("h2", { text: "E-mail de recuperação" }), body: parent });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      clearFlash(form);
      busy(submit, true, "Enviando confirmação…");
      try {
        const result = await recoveryPost("email", { email: email.value.trim(), password: password.value });
        password.value = "";
        if (!form.isConnected) return;
        const done = button("Concluir", "button--primary", () => close());
        parent.replaceChildren(
          paragraph(result.verified ? "Este e-mail já está confirmado." :
            "Abra o link enviado ao e-mail informado para confirmar o endereço. Confira também o spam.", "next-step"),
          done,
        );
        done.focus();
      } catch (error) {
        if (error.body?.error === "invalid_credentials") flash("A senha atual não confere. Confira e tente novamente.", form);
        else operationError(error, form.isConnected ? form : undefined);
      } finally {
        busy(submit, false);
      }
    });
  }
  function startPasswordReset(token) {
    const next = el("input", {
      id: "portal-reset-password", type: "password", name: "newPassword",
      required: "", minlength: "14", maxlength: "256", autocomplete: "new-password",
    });
    const confirmation = el("input", {
      id: "portal-reset-confirm", type: "password", name: "confirmPassword",
      required: "", minlength: "14", maxlength: "256", autocomplete: "new-password",
    });
    const submit = button("Salvar nova senha", "button--primary", undefined, "submit");
    const form = el("form", { method: "post", action: "/api/portal/recovery/reset" }, [
      passwordField(next, "Nova senha"), passwordField(confirmation, "Confirme a nova senha"), submit,
    ]);
    recoveryPage("Redefinir senha", "Crie uma senha com pelo menos 14 caracteres. As sessões abertas serão encerradas.", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      clearFlash(form);
      if (next.value.trim().length < 14) return flash("Use pelo menos 14 caracteres na nova senha.", form);
      if (next.value !== confirmation.value) return flash("As duas senhas precisam ser iguais.", form);
      busy(submit, true, "Salvando…");
      try {
        await recoveryPost("reset", { token, newPassword: next.value });
        entryState("Senha atualizada", "Entre com a nova senha para continuar.", "Entrar", () => login("", "", true));
      } catch (error) {
        if (error.status === 410) {
          entryState("O link não é mais válido", "Peça um novo link para redefinir sua senha.", "Pedir novo link", () => recoveryRequest());
        } else flash(errorMessage(error), form);
      } finally {
        busy(submit, false);
      }
    });
  }
  function startEmailConfirmation(token) {
    const confirm = button("Confirmar meu e-mail", "button--primary", async () => {
      if (confirm.disabled) return;
      busy(confirm, true, "Confirmando…");
      try {
        await recoveryPost("confirm", { token });
        entryState("E-mail de recuperação confirmado", "Se esquecer sua senha, use este endereço para recuperar o acesso.",
          "Voltar à Área do Cliente", start);
      } catch (error) {
        if (error.status === 410) {
          entryState("O link não é mais válido", "Entre na Área do Cliente e solicite uma nova confirmação.",
            "Voltar à Área do Cliente", start);
        } else flash(errorMessage(error), root.querySelector(".startup"));
      } finally {
        busy(confirm, false);
      }
    });
    recoveryPage("Confirmar e-mail de recuperação", "Confirme este endereço para poder criar uma nova senha se perder o acesso.", confirm);
  }
  function takeRecoveryLink() {
    if (isAdminPath) return false;
    const match = /^#(confirmar-email|redefinir-senha)=(.*)$/.exec(location.hash);
    if (!match) return false;
    history.replaceState(null, "", location.pathname);
    entryNavigation++;
    activeDialog?.(false);
    app = null;
    session = null;
    dashboard = null;
    dashboardRefresh++;
    Object.keys(filters).forEach((key) => { filters[key] = {}; });
    if (match[1] === "confirmar-email") startEmailConfirmation(match[2]);
    else startPasswordReset(match[2]);
    return true;
  }

  function notify(message) {
    if (app) app.feedback.textContent = message;
  }
  function endSession(message) {
    session = null;
    dashboard = null;
    dashboardRefresh++;
    Object.keys(filters).forEach((key) => { filters[key] = {}; });
    activeDialog?.(false);
    notify("");
    login(message, "", !message);
  }
  function operationError(error, host) {
    if (error.status === 401) return endSession(errorMessage(error));
    if (host) flash(errorMessage(error), host);
    else if (app) flash(errorMessage(error), app.notices);
  }
  async function refreshDashboard() {
    const owner = session;
    const revision = ++dashboardRefresh;
    const data = await api("/dashboard");
    if (owner !== session || revision !== dashboardRefresh) return false;
    dashboard = data;
    return true;
  }
  async function load() {
    if (!await refreshDashboard()) return;
    if (!app) {
      app = shell();
      app.feedback = el("p", { class: "app-feedback", role: "status" });
      app.notices = el("div", { class: "notice-region" }, app.feedback);
      app.outlet = el("div", { id: "portal-view" });
      const refresh = button("Atualizar dados", "button--line refresh-button", async () => {
        busy(refresh, true, "Atualizando…");
        clearFlash(app.notices);
        try {
          if (await refreshDashboard()) {
            renderView(view);
            notify("Dados atualizados.");
          }
        } catch (error) {
          operationError(error);
        } finally {
          busy(refresh, false);
        }
      });
      app.recoveryButton = !isAdminPath ? button("E-mail de recuperação", "button--line refresh-button", openRecoverySettings) : null;
      app.content.append(el("div", { class: "workspace-tools" }, [
        link("Ajuda", supportHref, "mobile-help"), app.recoveryButton, refresh,
      ]), app.notices, app.outlet);
      view = currentView();
    }
    renderView(view);
  }
  function renderView(id, focus = false) {
    if (!app) return;
    view = id;
    if (app.recoveryButton) app.recoveryButton.hidden = !dashboard.recovery?.available ||
      (id === "overview" && !dashboard.recovery.email);
    app.outlet.replaceChildren();
    app.nav.querySelectorAll("a").forEach((anchor) => {
      if (anchor.dataset.view === id) anchor.setAttribute("aria-current", "page");
      else anchor.removeAttribute("aria-current");
    });
    if (id === "overview") renderOverview(app.outlet);
    if (id === "control") renderControl(app.outlet);
    if (id === "tickets") renderTickets(app.outlet);
    if (id === "documents") renderDocuments(app.outlet);
    if (focus) app.outlet.querySelector("h1")?.focus();
  }
  function showView(id) {
    const hash = sections.find(([key]) => key === id)?.[2];
    if (hash === undefined || !app) return;
    const wanted = hash ? "#" + hash : "";
    if (location.hash !== wanted) history.pushState(null, "", location.pathname + location.search + wanted);
    clearFlash(app.notices);
    notify("");
    renderView(id, true);
  }
  window.addEventListener("hashchange", () => {
    if (takeRecoveryLink()) return;
    if (!app || location.hash === "#portal-main" || view === currentView()) return;
    activeDialog?.(false);
    clearFlash(app.notices);
    notify("");
    renderView(currentView(), true);
  });
  function entryState(heading, description, action, handler) {
    const title = el("h1", { text: heading, tabindex: "-1" });
    root.replaceChildren(el("section", { class: "startup", "aria-labelledby": "entry-title" }, [
      title, paragraph(description),
      el("div", { class: "startup-links" }, [
        action ? button(action, "button--primary", handler) : null,
        link("Voltar ao site", "/"), link("Falar com a CONFENGE", supportHref),
      ]),
    ]));
    title.id = "entry-title";
    title.focus();
  }
  async function enterDashboard() {
    entryState("Carregando sua área", "Buscando as informações da sua conta.");
    try {
      await load();
      app?.outlet.querySelector("h1")?.focus();
    } catch (error) {
      if (error.status === 401) return endSession(errorMessage(error));
      entryState("Não foi possível carregar sua área", errorMessage(error), "Tentar novamente", enterDashboard);
    }
  }
  async function start() {
    const launch = ++entryNavigation;
    try {
      const identity = await api("/session");
      if (launch !== entryNavigation) return;
      if (identity.role !== requestedRole) {
        const alternate = identity.role === "admin" ? "/portal-interno/" : "/area-do-cliente/";
        const switchRole = async () => {
          try {
            await api("/logout", { method: "POST" });
            login("", "", true);
          } catch (error) {
            if (error.status === 401) return login("", "", true);
            flash(errorMessage(error), root.querySelector(".startup"));
          }
        };
        entryState("Você já está em outra área", "Volte à área da conta atual ou saia dela para entrar aqui.",
          "Sair da conta atual", switchRole);
        root.querySelector(".startup-links").prepend(link("Voltar à minha área", alternate, "button button--line"));
        return;
      }
      session = identity;
      await enterDashboard();
    } catch (error) {
      if (launch !== entryNavigation) return;
      if (error.status === 401) return login();
      entryState("Não foi possível verificar seu acesso", errorMessage(error), "Tentar novamente", start);
    }
  }
  const fallback = root.querySelector("#portal-startup-status");
  if (fallback) fallback.textContent = "Verificando seu acesso…";
  if (!takeRecoveryLink()) start();
})();
